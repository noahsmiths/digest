import { useQuery } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { ArrowIcon } from './Chrome';
import { formatDate, serviceName, statusLabel, type Service } from './shared';
import { DEFAULT_CLASSIFICATION_PROMPT, digestCategories } from '../../shared/classificationPrompt';

export type DigestData = NonNullable<ReturnType<typeof useQuery<typeof api.digests.get>>>;

type HistoryItem = {
  _id: Id<'digests'>;
  _creationTime: number;
  status: 'running' | 'completed' | 'partial' | 'failed';
  postCount: number;
};

export function DigestPage({
  linkedServices,
  digests,
  paginationStatus,
  loadMore,
  currentDigestId,
  selectedDigest,
  activeDigest,
  isStartingDigest,
  error,
  onGenerate,
  onSelectDigest,
  onSettings,
}: {
  linkedServices: Service[];
  digests: HistoryItem[];
  paginationStatus: 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';
  loadMore: (numItems: number) => void;
  currentDigestId: Id<'digests'> | null;
  selectedDigest: DigestData | null | undefined;
  activeDigest: HistoryItem | undefined;
  isStartingDigest: boolean;
  error: string | null;
  onGenerate: () => Promise<void>;
  onSelectDigest: (digestId: Id<'digests'>) => void;
  onSettings: () => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <main className="digest-page page-frame">
      <div className="page-heading digest-heading">
        <div>
          <h1>Your digest.</h1>
          <p>{linkedServices.length} connected {linkedServices.length === 1 ? 'service' : 'services'} · The useful parts, in one place.</p>
        </div>
        <button
          className="primary-action"
          type="button"
          disabled={linkedServices.length === 0 || isStartingDigest || activeDigest !== undefined}
          onClick={() => void onGenerate()}
        >
          {isStartingDigest ? 'Starting…' : activeDigest !== undefined ? 'Digest in progress…' : 'Make a new digest'}
          {activeDigest === undefined && <ArrowIcon />}
        </button>
      </div>

      {error !== null && <p role="alert" className="inline-alert error-alert">{error}</p>}

      {linkedServices.length === 0 && (
        <div className="inline-alert empty-alert">
          <p>Connect a service before making a digest.</p>
          <button type="button" className="text-action" onClick={onSettings}>Open settings <ArrowIcon /></button>
        </div>
      )}

      <div className="reading-layout">
        <aside className="history-panel" aria-labelledby="history-title">
          <div className="history-heading">
            <h2 id="history-title">Past letters</h2>
            <span className="history-count">{digests.length}</span>
            <button className="history-toggle" type="button" aria-expanded={historyOpen} aria-controls="history-content" onClick={() => setHistoryOpen((open) => !open)}>
              {historyOpen ? 'Hide history' : 'Show history'}
            </button>
          </div>
          <div id="history-content" className={historyOpen ? 'history-content open' : 'history-content'}>
          {paginationStatus === 'LoadingFirstPage' ? (
            <p className="history-empty">Loading your history…</p>
          ) : digests.length === 0 ? (
            <p className="history-empty">Your first digest will live here when it is ready.</p>
          ) : (
            <ul className="history-list">
              {digests.map((digest) => (
                <li key={digest._id}>
                  <button
                    className={currentDigestId === digest._id ? 'history-item active' : 'history-item'}
                    type="button"
                    aria-current={currentDigestId === digest._id ? 'true' : undefined}
                    onClick={() => onSelectDigest(digest._id)}
                  >
                    <span className="history-date">{formatDate(digest._creationTime)}</span>
                    <span className="history-meta">{statusLabel(digest.status)} <span aria-hidden="true">·</span> {digest.postCount} posts</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(paginationStatus === 'CanLoadMore' || paginationStatus === 'LoadingMore') && (
            <button className="load-more" type="button" disabled={paginationStatus === 'LoadingMore'} onClick={() => loadMore(10)}>
              {paginationStatus === 'LoadingMore' ? 'Loading…' : 'More history'}
            </button>
          )}
          </div>
        </aside>

        <section className="reading-sheet letter-sheet" aria-label="Selected digest">
          {currentDigestId === null ? (
            <div className="digest-empty">
              <span className="empty-mark" aria-hidden="true">d.</span>
              <h2>A little less noise starts here.</h2>
              <p>Make a digest to gather the useful posts from your connected feeds into a read you can finish.</p>
              {linkedServices.length > 0 && <button className="text-action" type="button" onClick={() => void onGenerate()}>Make your first digest <ArrowIcon /></button>}
            </div>
          ) : selectedDigest === undefined ? (
            <div className="digest-empty" aria-live="polite">Opening this digest…</div>
          ) : selectedDigest === null ? (
            <div className="digest-empty">This digest is unavailable. Choose another from your history.</div>
          ) : (
            <DigestDetail key={selectedDigest.digest._id} digest={selectedDigest.digest} posts={selectedDigest.posts} />
          )}
        </section>
      </div>
    </main>
  );
}

function DigestDetail({ digest, posts }: { digest: DigestData['digest']; posts: DigestData['posts'] }) {
  const categories = useMemo(() => digestCategories(digest.classificationPrompt ?? DEFAULT_CLASSIFICATION_PROMPT, posts.map(({ category }) => category)), [digest.classificationPrompt, posts]);
  const groupedPosts = useMemo(() => Object.fromEntries(categories.map(({ id }) => [id, posts.filter(({ category }) => category === id)])), [categories, posts]);
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? '');
  const failedServices = digest.serviceResults.filter(({ status }) => status === 'failed');
  const completedServices = digest.serviceResults.filter(({ status }) => status !== 'pending').length;

  useEffect(() => {
    if ((digest.status !== 'completed' && digest.status !== 'partial') || categories.length === 0) return;
    const updateActiveSection = () => {
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 40) {
        setActiveCategory(categories[categories.length - 1].id);
        return;
      }
      const boundary = window.innerHeight * 0.38;
      const current = categories.reduce<string>((selected, category) => {
        const top = document.getElementById(`digest-${encodeURIComponent(category.id)}`)?.getBoundingClientRect().top;
        return top !== undefined && top <= boundary ? category.id : selected;
      }, categories[0].id);
      setActiveCategory(current);
    };
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    updateActiveSection();
    return () => window.removeEventListener('scroll', updateActiveSection);
  }, [digest._id, digest.status, categories]);

  const chooseCategory = (category: string) => {
    setActiveCategory(category);
    document.getElementById(`digest-${encodeURIComponent(category)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="digest-detail">
      <div className="digest-letter-head">
        <div>
          <h2>A little of what matters.</h2>
          <p className="digest-subline">{formatDate(digest._creationTime, 'long')} · {digest.postCount} posts from {digest.serviceResults.length} {digest.serviceResults.length === 1 ? 'service' : 'services'}</p>
        </div>
        <span className={`digest-status status-${digest.status}`}>{statusLabel(digest.status)}</span>
      </div>

      {digest.status === 'running' && (
        <div className="digest-progress" role="status">
          <span className="progress-line" aria-hidden="true"><span /></span>
          <p>{digest.stage === 'scraping' ? `Reading connected feeds (${completedServices}/${digest.serviceResults.length})…` : 'Choosing the useful posts…'}</p>
        </div>
      )}
      {failedServices.length > 0 && <p className="inline-alert warning-alert">Could not read {failedServices.map(({ service }) => serviceName(service)).join(', ')}. Available services are still included.</p>}
      {digest.classificationFallbackCount > 0 && <p className="inline-alert warning-alert">{digest.classificationFallbackCount} posts were omitted because they could not be categorized.</p>}
      {digest.status === 'failed' && <p className="inline-alert error-alert">This digest could not finish. Check your connections, then make another.</p>}

      {(digest.status === 'completed' || digest.status === 'partial') && (
        <div className="digest-letter-body">
          <nav className="digest-index" aria-label="Digest sections">
            <span className="index-title">In this digest</span>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={activeCategory === category.id ? 'index-link active' : 'index-link'}
                aria-current={activeCategory === category.id ? 'true' : undefined}
                onClick={() => chooseCategory(category.id)}
              >
                <span>{category.name}</span><span>{groupedPosts[category.id].length}</span>
              </button>
            ))}
          </nav>

          <div className="digest-passages">
            {categories.map((category) => (
              <section className="digest-section" id={`digest-${encodeURIComponent(category.id)}`} key={category.id}>
                <div className="digest-section-heading">
                  <h3>{category.name}</h3>
                  <p>{groupedPosts[category.id].length} {groupedPosts[category.id].length === 1 ? 'post' : 'posts'}</p>
                </div>
                {groupedPosts[category.id].length === 0 ? (
                  <p className="section-empty">Nothing in this section this time.</p>
                ) : (
                  groupedPosts[category.id].map((post) => <DigestPost key={post._id} post={post} />)
                )}
              </section>
            ))}
            <p className="digest-end">You’re caught up for now.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function DigestPost({ post }: { post: DigestData['posts'][number] }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [showFullText, setShowFullText] = useState(false);
  const image = post.images[imageIndex];
  const isLong = post.body.length > 620;
  const preview = isLong ? post.body.slice(0, 620).replace(/\s+\S*$/, '') : post.body;
  const nextImage = () => setImageIndex((index) => (index + 1) % post.images.length);
  const previousImage = () => setImageIndex((index) => (index - 1 + post.images.length) % post.images.length);

  return (
    <article className="digest-post">
      <div className="post-content">
        <div className="post-heading">
          <h4>{post.author}</h4>
          <span>{serviceName(post.service)}</span>
        </div>
        {post.body !== '' ? (
          <>
            <p className="post-body">{showFullText ? post.body : preview}{isLong && !showFullText ? '…' : ''}</p>
            {isLong && <button className="post-read-more" type="button" aria-expanded={showFullText} onClick={() => setShowFullText((open) => !open)}>{showFullText ? 'Show less' : 'Read full post'}</button>}
          </>
        ) : <p className="post-body post-body-empty">An image post from {post.author}.</p>}
      </div>
      {image !== undefined && (
        <div className="post-image-carousel" aria-label={`Images from ${post.author}'s post`}>
          <img src={image.url} alt={`Image ${imageIndex + 1} of ${post.images.length} from ${post.author}'s ${serviceName(post.service)} post`} />
          {post.images.length > 1 && (
            <div className="carousel-controls">
              <span className="carousel-count">{imageIndex + 1} / {post.images.length}</span>
              <div className="carousel-buttons">
                <button type="button" aria-label={`Previous image from ${post.author}'s post`} onClick={previousImage}><ArrowIcon direction="left" /></button>
                <button type="button" aria-label={`Next image from ${post.author}'s post`} onClick={nextImage}><ArrowIcon /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
