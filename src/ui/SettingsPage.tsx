import { useEffect, useRef, useState } from 'react';
import { ArrowIcon } from './Chrome';
import { Modal } from './Modal';
import { serviceName, services, type Service } from './shared';
import { classificationPromptError, DEFAULT_CLASSIFICATION_PROMPT, parseClassificationPrompt, serializeClassificationPrompt } from '../../shared/classificationPrompt';

type Preferences = {
  automaticDigestEnabled: boolean;
  deliveryTime: string;
  timeZone: string;
  classificationPrompt: string;
};

type SettingsSection = 'connections' | 'rules' | 'delivery';

export function SettingsPage({
  linkedServices,
  activeService,
  firecrawlLiveViewURL,
  loggingInService,
  disconnectingService,
  isSaving,
  error,
  preferences,
  onConnect,
  onDisconnect,
  onSave,
  onSavePreferences,
  onSaveClassificationPrompt,
  onDigest,
}: {
  linkedServices: Service[];
  activeService: Service | null;
  firecrawlLiveViewURL: string;
  loggingInService: Service | null;
  disconnectingService: Service | null;
  isSaving: boolean;
  error: string | null;
  preferences: Preferences;
  onConnect: (service: Service) => Promise<void>;
  onDisconnect: (service: Service) => Promise<void>;
  onSave: () => Promise<void>;
  onSavePreferences: (preferences: Pick<Preferences, 'automaticDigestEnabled' | 'deliveryTime'>) => Promise<void>;
  onSaveClassificationPrompt: (prompt: string) => Promise<void>;
  onDigest: () => void;
}) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('connections');

  return (
    <main className="settings-page page-frame">
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {([
            ['connections', 'Connections'],
            ['rules', 'Digest Categories'],
            ['delivery', 'Daily Delivery'],
          ] as const).map(([section, label]) => (
            <button
              className="settings-nav-link"
              type="button"
              key={section}
              aria-pressed={activeSection === section}
              onClick={() => setActiveSection(section)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="settings-panes">
          <section
            className="settings-pane settings-sheet letter-sheet"
            aria-labelledby="connections-title"
            hidden={activeSection !== 'connections'}
            tabIndex={0}
          >
            <div className="settings-sheet-head">
              <div>
                <h2 id="connections-title">Connections</h2>
                <p>{linkedServices.length === 0 ? 'Start with one service.' : `${linkedServices.length} of ${services.length} services connected.`}</p>
              </div>
            </div>

            <ul className="service-list">
              {services.map((service) => {
                const isConnected = linkedServices.includes(service.id);
                const isStarting = loggingInService === service.id;
                const isDisconnecting = disconnectingService === service.id;
                return (
                  <li className="service-row" key={service.id}>
                    <div className="service-name">
                      <div>
                        <h3>{service.name}</h3>
                      </div>
                    </div>
                    <div className="service-action">
                      <span className={isConnected ? 'connection-state connected' : 'connection-state'}>
                        <span aria-hidden="true" />{isConnected ? 'Connected' : 'Not connected'}
                      </span>
                      <button
                        className={isConnected ? 'primary-action danger-action' : 'primary-action'}
                        type="button"
                        disabled={loggingInService !== null || disconnectingService !== null || activeService !== null || isSaving}
                        onClick={isConnected ? () => void onDisconnect(service.id) : () => void onConnect(service.id)}
                      >
                        {isConnected ? (isDisconnecting ? 'Disconnecting…' : 'Disconnect') : (isStarting ? 'Opening…' : 'Connect')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {error !== null && <p role="alert" className="inline-alert error-alert">{error}</p>}

            {activeService !== null && firecrawlLiveViewURL !== '' && (
              <ConnectionLogin key={`${activeService}-${firecrawlLiveViewURL}`} service={activeService} url={firecrawlLiveViewURL} isSaving={isSaving} error={error} onSave={onSave} />
            )}
          </section>

          <div className="settings-pane settings-sheet letter-sheet" hidden={activeSection !== 'rules'}>
            <ClassificationSettings prompt={preferences.classificationPrompt} onSave={onSaveClassificationPrompt} />
          </div>

          <div className="settings-pane settings-sheet letter-sheet" hidden={activeSection !== 'delivery'}>
            <DailyDeliverySettings
              key={`${preferences.automaticDigestEnabled}-${preferences.deliveryTime}-${preferences.timeZone}`}
              preferences={preferences}
              onSave={onSavePreferences}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function ConnectionLogin({ service, url, isSaving, error, onSave }: { service: Service; url: string; isSaving: boolean; error: string | null; onSave: () => Promise<void> }) {
  const [isOpen, setIsOpen] = useState(true);
  const resumeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isOpen) resumeRef.current?.focus();
  }, [isOpen]);
  return (
    <>
      <div className="connection-resume">
        <p>Your {serviceName(service)} connection is not saved yet.</p>
        <button ref={resumeRef} className="small-action" type="button" onClick={() => setIsOpen(true)}>Resume connection <ArrowIcon /></button>
      </div>
      {isOpen && (
        <Modal className="connection-modal" label={`Connect ${serviceName(service)}`} onClose={() => setIsOpen(false)}>
          <div className="connection-login">
            <div className="connection-login-heading">
              <h2>Finish connecting {serviceName(service)}</h2>
              <p>Sign in below, then save the connection when it is complete.</p>
            </div>
            <iframe src={url} title={`${serviceName(service)} login`} />
            {error !== null && <p role="alert" className="inline-alert error-alert">{error}</p>}
            <button className="primary-action" type="button" disabled={isSaving} onClick={() => void onSave()}>
              {isSaving ? 'Saving connection…' : 'Save connection'} <ArrowIcon />
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function ClassificationSettings({ prompt, onSave }: { prompt: string; onSave: (prompt: string) => Promise<void> }) {
  const [draft, setDraft] = useState(() => parseClassificationPrompt(prompt));
  const [savedPrompt, setSavedPrompt] = useState(() => serializeClassificationPrompt(parseClassificationPrompt(prompt)));
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const serialized = serializeClassificationPrompt(draft);
  const dirty = serialized !== savedPrompt;

  const updateCategory = (index: number, field: 'name' | 'prompt', value: string) => {
    setDraft((current) => ({ ...current, categories: current.categories.map((category, categoryIndex) => categoryIndex === index ? { ...category, [field]: value } : category) }));
    setStatus(null);
    setError(null);
  };

  const save = async () => {
    const parsed = parseClassificationPrompt(serialized);
    const validationError = classificationPromptError(serialized)
      ?? (parsed.categories.length !== draft.categories.length || draft.categories.some(({ name, prompt }, index) => parsed.categories[index]?.name !== name.trim() || parsed.categories[index]?.prompt !== prompt.trim()) ? 'Use another heading level inside a rule; “##” is reserved for category names.' : null);
    if (validationError !== null) { setError(validationError); return; }
    setIsSaving(true);
    setError(null);
    setStatus(null);
    try {
      await onSave(serialized);
      setSavedPrompt(serialized);
      setStatus('Saved. Your next digest will use these rules.');
    } catch {
      setError('Could not save your classification rules. Your edits are still here — try saving again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="classification-settings" aria-labelledby="classification-settings-title">
      <div className="delivery-settings-heading">
        <h2 id="classification-settings-title">Your digest rules</h2>
        <p>Shape your digest with your own categories and rules. Changes apply to all new digests. You can also change these by naturally replying to a daily digest email, for example saying something like "Create a new category for Shoe Releases"</p>
      </div>
      <fieldset disabled={isSaving} className="classification-fields">
        <ul className="category-rules">
          {draft.categories.map((category, index) => (
            <li className="category-rule" key={index}>
              <div className="category-rule-head">
                <label className="prompt-field">
                  <span>Category name</span>
                  <input aria-label={`Category ${index + 1} name`} value={category.name} maxLength={80} onChange={(event) => updateCategory(index, 'name', event.target.value)} />
                </label>
                <button className="text-action" type="button" aria-label={`Remove ${category.name || 'category'}`} onClick={() => { setDraft({ ...draft, categories: draft.categories.filter((_, categoryIndex) => categoryIndex !== index) }); setStatus(null); }}>Remove</button>
              </div>
              <label className="prompt-field">
                <span>What belongs here</span>
                <textarea rows={4} value={category.prompt} onChange={(event) => updateCategory(index, 'prompt', event.target.value)} />
              </label>
            </li>
          ))}
        </ul>
        <div className="classification-actions">
          <button className="small-action" type="button" disabled={draft.categories.length >= 30} onClick={() => { setDraft({ ...draft, categories: [...draft.categories, { id: '', name: '', prompt: '' }] }); setStatus(null); }}>Add category</button>
          <button className="text-action" type="button" onClick={() => { setDraft(parseClassificationPrompt(DEFAULT_CLASSIFICATION_PROMPT)); setError(null); setStatus('Default rules restored. Save to apply them.'); }}>Restore defaults</button>
          <button className="primary-action" type="button" disabled={!dirty} onClick={() => void save()}>{isSaving ? 'Saving rules…' : 'Save rules'}</button>
        </div>
      </fieldset>
      {error !== null && <p role="alert" className="inline-alert error-alert">{error}</p>}
      <p className="classification-status" role="status">{status ?? (dirty ? 'Unsaved changes' : '')}</p>
    </section>
  );
}

function DailyDeliverySettings({
  preferences,
  onSave,
}: {
  preferences: Preferences;
  onSave: (preferences: Pick<Preferences, 'automaticDigestEnabled' | 'deliveryTime'>) => Promise<void>;
}) {
  const [automaticDigestEnabled, setAutomaticDigestEnabled] = useState(preferences.automaticDigestEnabled);
  const [deliveryTime, setDeliveryTime] = useState(preferences.deliveryTime);

  const updateAutomaticDigest = (enabled: boolean) => {
    setAutomaticDigestEnabled(enabled);
    void onSave({ automaticDigestEnabled: enabled, deliveryTime });
  };

  const updateDeliveryTime = (time: string) => {
    setDeliveryTime(time);
    void onSave({ automaticDigestEnabled, deliveryTime: time });
  };

  return (
    <section className="delivery-settings" aria-labelledby="delivery-settings-title">
      <div className="delivery-settings-heading">
        <h2 id="delivery-settings-title">Daily delivery</h2>
        <p>A new digest is automatically created at your selected time and emailed to you.</p>
      </div>
      <label className="delivery-switch">
        <input
          type="checkbox"
          checked={automaticDigestEnabled}
          onChange={(event) => updateAutomaticDigest(event.target.checked)}
        />
        <span className="delivery-switch-control" aria-hidden="true"><span /></span>
        <span>
          <strong>Automatically make my digest every day</strong>
        </span>
      </label>
      <label className="delivery-time-field">
        <span>Delivery time</span>
        <input
          type="time"
          value={deliveryTime}
          disabled={!automaticDigestEnabled}
          onChange={(event) => updateDeliveryTime(event.target.value)}
        />
        <small>Your local time zone: {preferences.timeZone}</small>
      </label>
    </section>
  );
}
