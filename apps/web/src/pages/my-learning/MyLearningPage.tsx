import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, GraduationCap, LoaderCircle, RefreshCcw, ShieldAlert } from 'lucide-react';
import {
  getMyLearningWorkspace,
  launchLearningAssignment,
  type LearningRecord,
  type MyLearningWorkspace,
} from '@/pages/learning/learning.api';
import './MyLearningPage.css';

type MyLearningTab = 'assigned' | 'optional' | 'transcript' | 'certificates';

function formatDate(value: string | null) {
  if (!value) {
    return 'TBD';
  }

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDuration(minutes: number | null) {
  if (!minutes) {
    return 'Self-paced';
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function getStatusBadge(status: string) {
  if (status === 'Completed') {
    return 'badge-success';
  }

  if (status === 'Overdue' || status === 'Expired') {
    return 'badge-danger';
  }

  if (status === 'In Progress') {
    return 'badge-primary';
  }

  return 'badge-warning';
}

export function MyLearningPage() {
  const [workspace, setWorkspace] = useState<MyLearningWorkspace | null>(null);
  const [tab, setTab] = useState<MyLearningTab>('assigned');
  const [loading, setLoading] = useState(true);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextWorkspace = await getMyLearningWorkspace();
      setWorkspace(nextWorkspace);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your learning workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const currentItems = useMemo(() => {
    if (!workspace) {
      return [] as LearningRecord[];
    }

    if (tab === 'assigned') {
      return workspace.assigned;
    }

    if (tab === 'optional') {
      return workspace.optional;
    }

    if (tab === 'transcript') {
      return workspace.transcript;
    }

    return workspace.certificates;
  }, [tab, workspace]);

  const handleLaunch = async (record: LearningRecord) => {
    if (!record.assignmentId) {
      return;
    }

    setLaunchingId(record.id);
    setError(null);

    try {
      const launch = await launchLearningAssignment(record.assignmentId, record.id);
      window.open(launch.launchUrl, '_blank', 'noopener,noreferrer');
      await loadWorkspace();
    } catch (launchError) {
      setError(launchError instanceof Error ? launchError.message : 'Unable to launch the learning content.');
    } finally {
      setLaunchingId(null);
    }
  };

  if (loading && !workspace) {
    return (
      <div className="learning-stack">
        <div className="card learning-state">
          <LoaderCircle className="learning-spin" size={18} />
          <span>Loading learning workspace...</span>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="learning-stack">
        <div className="card learning-state">
          <ShieldAlert size={18} />
          <span>{error ?? 'Unable to load your learning workspace.'}</span>
        </div>
      </div>
    );
  }

  return (
    <section className="learning-stack">
      <div className="card learning-hero">
        <div className="page-header learning-hero-header">
          <div>
            <span className="learning-eyebrow">My Work</span>
            <h1 className="page-title">My Learning</h1>
            <p className="page-subtitle">Assigned training, optional development content, transcript history, and certificate visibility in one clean self-service workspace.</p>
          </div>
          <button type="button" className="button button-outline" onClick={() => { void loadWorkspace(); }}>
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>

        {!workspace.summary.access.accountLinked ? (
          <div className="learning-banner learning-banner-warning">
            <ShieldAlert size={16} />
            <span>Your account is not linked to an employee profile yet. Learning records and launches will be limited until that link is established.</span>
          </div>
        ) : null}

        {error ? (
          <div className="learning-banner learning-banner-error">
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="learning-summary-grid">
          <SummaryCard label="Required open" value={workspace.summary.my.requiredOpen} detail="Assigned learning still in progress" />
          <SummaryCard label="Due soon" value={workspace.summary.my.dueSoon} detail="Due in the next 7 days" />
          <SummaryCard label="Overdue" value={workspace.summary.my.overdue} detail="Past the expected completion date" />
          <SummaryCard label="Certificate alerts" value={workspace.summary.my.certificateAlerts} detail="Expiring in the next 30 days" />
        </div>
      </div>

      <div className="card">
        <div className="learning-tab-list">
          {[
            ['assigned', 'Assigned'],
            ['optional', 'Optional'],
            ['transcript', 'Transcript'],
            ['certificates', 'Certificates'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`learning-tab ${tab === value ? 'learning-tab-active' : ''}`}
              onClick={() => setTab(value as MyLearningTab)}
            >
              {label}
            </button>
          ))}
        </div>

        {currentItems.length === 0 ? (
          <div className="learning-empty-state">
            <GraduationCap size={18} />
            <span>No items are currently available in this view.</span>
          </div>
        ) : (
          <div className="learning-card-grid">
            {currentItems.map((record) => (
              <article key={record.id} className="learning-card">
                <div className="learning-card-header">
                  <div>
                    <h3>{record.content.title}</h3>
                    <p>{record.content.provider.displayName} | {record.content.modality} | {formatDuration(record.content.durationMinutes)}</p>
                  </div>
                  <span className={`badge ${getStatusBadge(record.displayStatus)}`}>{record.displayStatus}</span>
                </div>

                {record.content.description ? (
                  <p className="learning-card-copy">{record.content.description}</p>
                ) : null}

                <div className="learning-meta-grid">
                  <span><strong>Requirement:</strong> {record.mandatory ? 'Mandatory' : record.requirementType}</span>
                  <span><strong>Due:</strong> {formatDate(record.dueDate)}</span>
                  <span><strong>Progress:</strong> {record.progressPercent}%</span>
                  <span><strong>Path:</strong> {record.path?.name ?? 'Standalone course'}</span>
                  <span><strong>Completed:</strong> {formatDate(record.completedAt)}</span>
                  <span><strong>Certificate expiry:</strong> {formatDate(record.certificateExpiresAt)}</span>
                </div>

                {record.content.tags.length > 0 ? (
                  <div className="learning-tag-row">
                    {record.content.tags.map((tag) => (
                      <span key={tag} className="learning-tag">{tag}</span>
                    ))}
                  </div>
                ) : null}

                <div className="learning-card-actions">
                  {record.canLaunch && record.assignmentId ? (
                    <button type="button" className="button" onClick={() => { void handleLaunch(record); }} disabled={launchingId === record.id}>
                      <ExternalLink size={16} />
                      {launchingId === record.id ? 'Launching...' : 'Launch content'}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="learning-summary-card">
      <span className="learning-summary-label">{label}</span>
      <strong className="learning-summary-value">{value}</strong>
      <span className="learning-summary-detail">{detail}</span>
    </div>
  );
}
