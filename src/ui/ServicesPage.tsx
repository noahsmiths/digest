import { ArrowIcon } from './Chrome';
import { serviceName, services, type Service } from './shared';

export function ServicesPage({
  linkedServices,
  activeService,
  firecrawlLiveViewURL,
  loggingInService,
  disconnectingService,
  isSaving,
  error,
  onConnect,
  onDisconnect,
  onSave,
  onDigest,
}: {
  linkedServices: Service[];
  activeService: Service | null;
  firecrawlLiveViewURL: string;
  loggingInService: Service | null;
  disconnectingService: Service | null;
  isSaving: boolean;
  error: string | null;
  onConnect: (service: Service) => Promise<void>;
  onDisconnect: (service: Service) => Promise<void>;
  onSave: () => Promise<void>;
  onDigest: () => void;
}) {
  return (
    <main className="settings-page page-frame">
      <div className="page-heading settings-heading">
        <h1>Choose what comes through.</h1>
        <p>Connect the services you want Digest to read. You can change this list whenever you like.</p>
      </div>

      <section className="settings-sheet letter-sheet" aria-labelledby="settings-title">
        <div className="settings-sheet-head">
          <div>
            <h2 id="settings-title">Connections</h2>
            <p>{linkedServices.length === 0 ? 'Start with one service.' : `${linkedServices.length} of ${services.length} services connected.`}</p>
          </div>
          <span className="sheet-corner" aria-hidden="true">d.</span>
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
                    <p>{service.detail}</p>
                  </div>
                </div>
                <div className="service-action">
                  <span className={isConnected ? 'connection-state connected' : 'connection-state'}>
                    <span aria-hidden="true" />{isConnected ? 'Connected' : 'Not connected'}
                  </span>
                  <button
                    className="small-action"
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
          <div className="connection-login">
            <div className="connection-login-heading">
              <h3>Finish connecting {serviceName(activeService)}</h3>
              <p>Sign in below, then save the connection when it is complete.</p>
            </div>
            <iframe src={firecrawlLiveViewURL} title={`${serviceName(activeService)} login`} />
            <button className="primary-action" type="button" disabled={isSaving} onClick={() => void onSave()}>
              {isSaving ? 'Saving connection…' : 'Save connection'} <ArrowIcon />
            </button>
          </div>
        )}

        <div className="settings-sheet-foot">
          <p>{linkedServices.length === 0 ? 'Connect a service to make your first digest.' : 'Your sources are ready. Your digest is one step away.'}</p>
          <button className="primary-action" type="button" disabled={linkedServices.length === 0} onClick={onDigest}>
            Go to my digest <ArrowIcon />
          </button>
        </div>
      </section>
    </main>
  );
}
