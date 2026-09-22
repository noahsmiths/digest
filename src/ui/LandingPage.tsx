import { useRef, useState } from 'react';
import { AuthButton } from '../auth/AuthForm';
import { Brand } from './Chrome';
import { Modal } from './Modal';
import { categories, type Category } from './shared';

export function LandingPage() {
  return (
    <div className="landing-page">
      <header className="site-header landing-header">
        <Brand />
        <AuthButton label="Sign in" className="header-auth" />
      </header>

      <main>
        <section className="landing-hero">
          <div className="hero-story">
            <h1>Welcome to Digest!</h1>
            <p className="hero-description">
              <p>
                Social media is riddled with ads and algorithms created specifically to suck us in and take up our time. But leaving social media entirely is hard, especially because many of us rely on it for information and staying connected with friends and family.
              </p>
              <br></br>
              <p>
              That's where Digest comes in. Digest cuts out all of the bloat and distills your feeds into a daily newsletter, containing only what you really want to see.
              </p>
            </p>
            <AuthButton label="Try it out now!" className="primary-action hero-action w-[90%]" />
          </div>

          <div className="hero-example">
            <ExampleLetter />
            <p className="example-note">Illustrative preview. Your own Digest uses your connected feeds</p>
          </div>
        </section>

      </main>

    </div>
  );
}

function ExampleLetter() {
  const [section, setSection] = useState<Category>('social');
  const [imageOpen, setImageOpen] = useState(false);
  const letterRef = useRef<HTMLDivElement>(null);
  const passagesRef = useRef<HTMLDivElement>(null);
  const postsByCategory: Record<Category, { author: string; service: string; body: string; image?: string }[]> = {
    social: [
      { author: 'Maya Chen', service: 'Instagram', body: 'community garden beds are finally taking shape!! come by for the planting day this Sunday.', image: '/sample-garden.jpg' },
      { author: 'Kevin Mitnick', service: 'X (Twitter)', body: 'Wheels down Brooklyn!' },
    ],
    event: [
      { author: 'Queens Book Exchange', service: 'Instagram', body: 'We\'re having a neighborhood book swap is happening next Saturday afternoon in Flushing Meadows. Bring some books to swap!!!\n\n#booksareawesome' },
    ],
  };

  const chooseSection = (next: Category) => {
    setSection(next);
    const scroller = letterRef.current;
    const target = document.getElementById(`example-${next}`);
    const passages = passagesRef.current;
    if (!scroller || !target || !passages) return;
    passages.style.setProperty('--digest-trailing-space', '0px');
    const inset = Number.parseFloat(getComputedStyle(target).scrollMarginTop);
    const targetTop = scroller.scrollTop + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - inset;
    passages.style.setProperty('--digest-trailing-space', `${Math.max(0, targetTop - (scroller.scrollHeight - scroller.clientHeight))}px`);
    scroller.scrollTo({ top: targetTop, behavior: 'smooth' });
  };

  return (
    <div className="example-letter reading-sheet letter-sheet" ref={letterRef}>
      <div className="digest-letter-body">
        <nav className="digest-index" aria-label="Example Digest sections">
          <span className="index-title">Sections</span>
          {categories.map((category) => (
            <button
              className={section === category.id ? 'index-link active' : 'index-link'}
              type="button"
              key={category.id}
              aria-current={section === category.id ? 'true' : undefined}
              onClick={() => chooseSection(category.id)}
            >
              <span>{category.name}</span><span>{postsByCategory[category.id].length}</span>
            </button>
          ))}
        </nav>
        <div className="digest-passages" ref={passagesRef}>
          {categories.map((category) => (
            <section id={`example-${category.id}`} className="digest-section" key={category.id}>
              <div className="digest-section-heading">
                <h3>{category.name}</h3>
                <p>{postsByCategory[category.id].length} {postsByCategory[category.id].length === 1 ? 'post' : 'posts'}</p>
              </div>
              {postsByCategory[category.id].map((post) => (
                <article className="digest-post" key={post.author}>
                  <div className="post-content">
                    <div className="post-heading">
                      <h4>{post.author}</h4>
                      <span>{post.service}</span>
                    </div>
                    <p className="post-body">{post.body}</p>
                  </div>
                  {post.image && (
                    <div className="post-image-carousel">
                      <button
                        className="post-image-open"
                        type="button"
                        aria-label={`View image from ${post.author}'s post`}
                        aria-haspopup="dialog"
                        onClick={() => setImageOpen(true)}
                      >
                        <img src={post.image} alt="Illustrative community garden" />
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>
      {imageOpen && (
        <Modal className="image-modal" label="Image from Maya Chen's post" onClose={() => setImageOpen(false)}>
          <div className="image-modal-heading"><h2>Maya Chen</h2><p>Instagram</p></div>
          <img className="image-modal-image" src="/sample-garden.jpg" alt="Illustrative community garden" />
        </Modal>
      )}
    </div>
  );
}
