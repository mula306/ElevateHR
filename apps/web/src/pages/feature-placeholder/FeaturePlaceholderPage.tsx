import './FeaturePlaceholderPage.css';

interface FeaturePlaceholderPageProps {
  title: string;
  summary: string;
  description: string;
  capabilities: string[];
}

export function FeaturePlaceholderPage({
  title,
  summary,
  description,
  capabilities,
}: FeaturePlaceholderPageProps) {
  return (
    <section className="feature-placeholder">
      <div className="feature-placeholder-hero card">
        <span className="feature-placeholder-pill">Planned Workspace</span>
        <h1 className="page-title">{title}</h1>
        <p className="feature-placeholder-summary">{summary}</p>
        <p className="feature-placeholder-description">{description}</p>
      </div>

      <div className="feature-placeholder-grid">
        <div className="card">
          <h2 className="feature-placeholder-card-title">What belongs here</h2>
          <ul className="feature-placeholder-list">
            {capabilities.map((capability) => (
              <li key={capability}>{capability}</li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2 className="feature-placeholder-card-title">Suggested next build step</h2>
          <p className="feature-placeholder-description">
            Connect this page to backend APIs, move feature-specific components beside it, and keep shared UI primitives in `shared`.
          </p>
        </div>
      </div>
    </section>
  );
}
