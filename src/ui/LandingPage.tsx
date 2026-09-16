import { useState } from 'react';
import { AuthButton } from '../auth/AuthForm';
import { ArrowIcon, Brand } from './Chrome';
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
            <h1>Keep up.<br /><em>Without the feed.</em></h1>
            <p className="hero-description">
              Digest gathers the useful updates from your social accounts into one quiet, readable place.
              No endless scroll. No reason to open the platforms just to see what you missed.
            </p>
            <AuthButton label="Start with Digest" className="primary-action hero-action" />
            <p className="hero-after">Connect the services you choose. Read only when you choose.</p>
          </div>

          <div className="hero-example">
            <ExampleLetter />
            <p className="example-note">Illustrative preview · Your own digest uses your connected feeds</p>
          </div>
        </section>

        <section className="landing-close" aria-labelledby="landing-close-title">
          <div className="landing-close-copy">
            <h2 id="landing-close-title">Your attention belongs to you.</h2>
            <p>Connect your accounts once, return for a digest when you want one, and keep a history you can read at your own pace.</p>
          </div>
          <AuthButton label="Begin reading" className="text-action" />
        </section>
      </main>

      <footer className="site-footer">
        <Brand />
        <span>A quieter way to stay in the loop.</span>
      </footer>
    </div>
  );
}

function ExampleLetter() {
  const [section, setSection] = useState<Category>('social');
  const chooseSection = (next: Category) => {
    setSection(next);
    document.getElementById(`example-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <div className="example-letter letter-sheet">
      <div className="letter-head">
        <div>
          <h2>A little of what matters.</h2>
        </div>
        <span className="letter-seal" aria-hidden="true">d.</span>
      </div>
      <div className="example-body">
        <nav className="letter-index" aria-label="Example sections">
          <span className="index-title">In this letter</span>
          {categories.map((category) => (
            <button
              className={section === category.id ? 'index-link active' : 'index-link'}
              type="button"
              key={category.id}
              aria-current={section === category.id ? 'true' : undefined}
              onClick={() => chooseSection(category.id)}
            >
              {category.name}
            </button>
          ))}
        </nav>
        <div className="example-passages">
          <section id="example-social" className="example-section">
            <h3>Social</h3>
            <article className="example-entry">
              <div className="example-entry-copy">
                <p className="entry-source">From your network</p>
                <p>Maya shared an update on the community garden she has been building with friends.</p>
              </div>
              <img src="/sample-garden.jpg" alt="Illustrative community garden" />
            </article>
            <article className="example-entry">
              <div className="example-entry-copy">
                <p className="entry-source">From your network</p>
                <p>Jon is back in town and looking forward to seeing old friends this week.</p>
              </div>
            </article>
          </section>
          <section id="example-event" className="example-section">
            <h3>Upcoming events</h3>
            <article className="example-entry">
              <div className="example-entry-copy">
                <p className="entry-source">From your network</p>
                <p>A neighborhood book swap is happening next Saturday afternoon.</p>
              </div>
            </article>
          </section>
        </div>
      </div>
      <div className="letter-foot">The letter ends here. So can your scrolling. <ArrowIcon /></div>
    </div>
  );
}
