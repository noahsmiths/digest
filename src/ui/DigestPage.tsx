import { useMutation, useQuery } from 'convex/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { ArrowIcon } from './Chrome';
import { Modal } from './Modal';
import { formatDate, serviceName, statusLabel, type Service } from './shared';
import { DEFAULT_CLASSIFICATION_PROMPT, digestCategories } from '../../shared/classificationPrompt';
import { digestPath } from '../../shared/routes';

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
}: {
  linkedServices: Service[];
  digests: HistoryItem[];
  paginationStatus: 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';
  loadMore: (numItems: number) => void;
  currentDigestId: string | null;
  selectedDigest: DigestData | null | undefined;
  activeDigest: HistoryItem | undefined;
  isStartingDigest: boolean;
  error: string | null;
  onGenerate: () => Promise<void>;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <main className="digest-page page-frame">
      {error !== null && <p role="alert" className="inline-alert error-alert">{error}</p>}

      {linkedServices.length === 0 && (
        <div className="inline-alert empty-alert">
          <p>Connect a service before making a Digest.</p>
          <Link className="text-action" to="/settings">Open settings <ArrowIcon /></Link>
        </div>
      )}

      <div className="reading-layout">
        <aside className="history-panel" aria-labelledby="history-title">
          <button
            className="primary-action history-new-digest"
            type="button"
            disabled={linkedServices.length === 0 || isStartingDigest || activeDigest !== undefined}
            onClick={() => void onGenerate()}
          >
            <span>{isStartingDigest ? 'Starting…' : activeDigest !== undefined ? 'Digest in progress…' : 'Make a new Digest'}</span>
            {activeDigest === undefined && <ArrowIcon />}
          </button>
          <div className="history-heading">
            <h2 id="history-title">Past Digests</h2>
            <button className="history-toggle" type="button" aria-expanded={historyOpen} aria-controls="history-content" onClick={() => setHistoryOpen((open) => !open)}>
              {historyOpen ? 'Hide history' : 'Show history'}
            </button>
          </div>
          <div id="history-content" className={historyOpen ? 'history-content open' : 'history-content'}>
          {paginationStatus === 'LoadingFirstPage' ? (
            <p className="history-empty">Loading your history…</p>
          ) : digests.length === 0 ? (
            <p className="history-empty">Your first Digest will live here when it is ready.</p>
          ) : (
            <ul className="history-list">
              {digests.map((digest) => (
                <li key={digest._id}>
                  <Link
                    className={currentDigestId === digest._id ? 'history-item active' : 'history-item'}
                    to={digestPath(digest._id)}
                    aria-current={currentDigestId === digest._id ? 'true' : undefined}
                  >
                    <span className="history-date">{formatDate(digest._creationTime)}</span>
                    <span className="history-meta">
                      {statusLabel(digest.status)}
                      {(digest.status === 'completed' || digest.status === 'partial') && (
                        <> <span aria-hidden="true">·</span> {digest.postCount} posts</>
                      )}
                    </span>
                  </Link>
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

        <section className="reading-sheet letter-sheet" aria-label="Selected Digest" tabIndex={0}>
          {currentDigestId === null ? (
            <div className="digest-empty digest-empty-placeholder">
              <h2>No Digests yet. Create one now!</h2>
              {linkedServices.length > 0 && <button className="text-action" type="button" onClick={() => void onGenerate()}>Make your first Digest <ArrowIcon /></button>}
            </div>
          ) : selectedDigest === undefined ? (
            <div className="digest-empty" aria-live="polite">Opening this Digest…</div>
          ) : selectedDigest === null ? (
            <div className="digest-empty">This Digest is unavailable. Choose another from your history.</div>
          ) : (
            <DigestDetail key={selectedDigest.digest._id} digest={selectedDigest.digest} posts={selectedDigest.posts} />
          )}
        </section>
      </div>
    </main>
  );
}

function DigestDetail({ digest, posts }: { digest: DigestData['digest']; posts: DigestData['posts'] }) {
  const removeDigest = useMutation(api.digests.remove);
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const categories = useMemo(() => digestCategories(digest.classificationPrompt ?? DEFAULT_CLASSIFICATION_PROMPT, posts.map(({ category }) => category)), [digest.classificationPrompt, posts]);
  const groupedPosts = useMemo(() => Object.fromEntries(categories.map(({ id }) => [id, posts.filter(({ category }) => category === id)])), [categories, posts]);
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? '');
  const detailRef = useRef<HTMLDivElement>(null);
  const passagesRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const failedServices = digest.serviceResults.filter(({ status }) => status === 'failed');
  const isReadable = digest.status === 'completed' || digest.status === 'partial';

  const deleteDigest = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await removeDigest({ digestId: digest._id });
      await navigate('/digest', { replace: true });
    } catch (cause) {
      console.error('Failed to delete digest:', cause);
      setDeleteError('Could not delete this Digest. Please try again.');
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    const scroller = detailRef.current?.closest<HTMLElement>('.reading-sheet');
    scroller?.scrollTo({ top: 0, behavior: 'instant' });
    const cancelScroll = () => {
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    };
    scroller?.addEventListener('wheel', cancelScroll, { passive: true });
    scroller?.addEventListener('touchstart', cancelScroll, { passive: true });
    scroller?.addEventListener('pointerdown', cancelScroll, { passive: true });
    scroller?.addEventListener('keydown', cancelScroll);
    return () => {
      cancelScroll();
      scroller?.removeEventListener('wheel', cancelScroll);
      scroller?.removeEventListener('touchstart', cancelScroll);
      scroller?.removeEventListener('pointerdown', cancelScroll);
      scroller?.removeEventListener('keydown', cancelScroll);
    };
  }, [digest._id]);

  useEffect(() => {
    if ((digest.status !== 'completed' && digest.status !== 'partial') || categories.length === 0) return;
    const scroller = detailRef.current?.closest<HTMLElement>('.reading-sheet');
    if (!scroller) return;
    const updateActiveSection = () => {
      if (scroller.scrollHeight > scroller.clientHeight && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
        setActiveCategory(categories[categories.length - 1].id);
        return;
      }
      const boundary = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.38;
      const current = categories.reduce<string>((selected, category) => {
        const top = document.getElementById(`digest-${encodeURIComponent(category.id)}`)?.getBoundingClientRect().top;
        return top !== undefined && top <= boundary ? category.id : selected;
      }, categories[0].id);
      setActiveCategory(current);
    };
    scroller.addEventListener('scroll', updateActiveSection, { passive: true });
    updateActiveSection();
    return () => scroller.removeEventListener('scroll', updateActiveSection);
  }, [digest._id, digest.status, categories]);

  const chooseCategory = (category: string) => {
    setActiveCategory(category);
    const scroller = detailRef.current?.closest<HTMLElement>('.reading-sheet');
    const section = document.getElementById(`digest-${encodeURIComponent(category)}`);
    const passages = passagesRef.current;
    if (!scroller || !section || !passages) return;
    passages.style.setProperty('--digest-trailing-space', '0px');
    const inset = Number.parseFloat(getComputedStyle(section).scrollMarginTop);
    const targetTop = scroller.scrollTop + section.getBoundingClientRect().top - scroller.getBoundingClientRect().top - inset;
    passages.style.setProperty('--digest-trailing-space', `${Math.max(0, targetTop - (scroller.scrollHeight - scroller.clientHeight))}px`);
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = null;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      scroller.scrollTo({ top: targetTop, behavior: 'instant' });
      return;
    }
    const startTop = scroller.scrollTop;
    const distance = Math.max(0, targetTop) - startTop;
    let startedAt: number | undefined;
    const animateScroll = (now: number) => {
      startedAt ??= now;
      const progress = Math.min(1, (now - startedAt) / 180);
      scroller.scrollTo({ top: startTop + distance * (1 - (1 - progress) ** 3), behavior: 'instant' });
      scrollFrameRef.current = progress < 1 ? requestAnimationFrame(animateScroll) : null;
    };
    scrollFrameRef.current = requestAnimationFrame(animateScroll);
  };

  return (
    <div className="digest-detail" ref={detailRef}>
      {digest.status === 'running' && (
        <div className="digest-progress" role="status">
          <span className="progress-line" aria-hidden="true"><span /></span>
          <p>{digest.stage === 'queued' ? 'Your Digest is queued and will start when the current Digest finishes...' : digest.stage === 'scraping' ? 'Gathering posts...' : 'Choosing the useful posts...'}</p>
        </div>
      )}
      {failedServices.length > 0 && <p className="inline-alert warning-alert">Could not read {failedServices.map(({ service }) => serviceName(service)).join(', ')}. Available services are still included.</p>}
      {digest.classificationFallbackCount > 0 && <p className="inline-alert warning-alert">{digest.classificationFallbackCount} posts were omitted because they could not be categorized.</p>}
      {digest.status === 'failed' && <p className="inline-alert error-alert">This Digest could not finish. Check your connections, then make another.</p>}

      <div className="digest-letter-body">
        <nav className="digest-index" aria-label={isReadable ? 'Digest sections' : 'Digest actions'}>
          {isReadable && <span className="index-title">Sections</span>}
          {isReadable && categories.map((category) => (
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
          <button
            className="digest-delete-action"
            type="button"
            aria-haspopup="dialog"
            onClick={() => { setDeleteError(null); setDeleteOpen(true); }}
          >
            Delete Digest
          </button>
        </nav>

        {isReadable && <div className="digest-passages" ref={passagesRef}>
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
          <p className="digest-end">All caught up!</p>
        </div>}
      </div>
      {deleteOpen && (
        <Modal className="delete-digest-modal" label="Delete Digest" onClose={() => { if (!isDeleting) setDeleteOpen(false); }}>
          <h2>Delete this Digest?</h2>
          <p>The Digest from {formatDate(digest._creationTime)} and all its posts, images, and related data will be permanently deleted. This cannot be undone.</p>
          {deleteError !== null && <p role="alert" className="inline-alert error-alert">{deleteError}</p>}
          <div className="delete-digest-actions" aria-busy={isDeleting}>
            <button className="small-action" type="button" disabled={isDeleting} onClick={() => setDeleteOpen(false)}>Cancel</button>
            <button className="primary-action danger-action" type="button" disabled={isDeleting} onClick={() => void deleteDigest()}>
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DigestPost({ post }: { post: DigestData['posts'][number] }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [imagesOpen, setImagesOpen] = useState(false);
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
          <button className="post-image-open" type="button" aria-label={`View image ${imageIndex + 1} of ${post.images.length} from ${post.author}'s post`} aria-haspopup="dialog" onClick={() => setImagesOpen(true)}>
            <img src={image.url} alt={`Image ${imageIndex + 1} of ${post.images.length} from ${post.author}'s ${serviceName(post.service)} post`} />
          </button>
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
      {imagesOpen && image !== undefined && (
        <Modal
          className="image-modal"
          label={`Images from ${post.author}'s post`}
          onClose={() => setImagesOpen(false)}
          onKeyDown={(event) => {
            if (post.images.length < 2) return;
            if (event.key === 'ArrowLeft') { event.preventDefault(); previousImage(); }
            if (event.key === 'ArrowRight') { event.preventDefault(); nextImage(); }
          }}
        >
          <div className="image-modal-heading"><h2>{post.author}</h2><p>{serviceName(post.service)}</p></div>
          <img className="image-modal-image" src={image.url} alt={`Image ${imageIndex + 1} of ${post.images.length} from ${post.author}'s ${serviceName(post.service)} post`} />
          <div className="image-modal-controls">
            {post.images.length > 1 && <button className="small-action" type="button" aria-label="Previous image" onClick={previousImage}><ArrowIcon direction="left" /> Previous</button>}
            <span className="carousel-count" role="status" aria-live="polite">{imageIndex + 1} / {post.images.length}</span>
            {post.images.length > 1 && <button className="small-action" type="button" aria-label="Next image" onClick={nextImage}>Next <ArrowIcon /></button>}
          </div>
        </Modal>
      )}
    </article>
  );
}
