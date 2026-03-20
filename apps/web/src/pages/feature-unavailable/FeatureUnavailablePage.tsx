import { ShieldAlert } from 'lucide-react';
import './FeatureUnavailablePage.css';

export function FeatureUnavailablePage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="feature-unavailable-page">
      <div className="card feature-unavailable-card">
        <div className="feature-unavailable-icon">
          <ShieldAlert size={20} />
        </div>
        <span className="feature-unavailable-pill">Unavailable</span>
        <h1 className="page-title">{title}</h1>
        <p className="feature-unavailable-copy">{description}</p>
      </div>
    </section>
  );
}

