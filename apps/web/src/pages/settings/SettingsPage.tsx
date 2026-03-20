import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, LoaderCircle, PencilLine, Plus, RefreshCcw, Search, Settings2, ShieldAlert } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppSession } from '@/shared/auth/AppSessionProvider';
import type { FeatureState } from '@/shared/features/feature-registry';
import type {
  ApprovalRuleSetRecord,
  FundingTypeRecord,
  RequestTypeRecord,
} from '@/pages/recruitment/recruitment.api';
import {
  createSkillCategory,
  createSkillTag,
  listApprovalRuleSets,
  listFeatureSettings,
  listFundingTypes,
  listRequestTypes,
  listSkillSettings,
  updateFeatureSetting,
  updateSkillCategory,
  updateSkillTag,
  type SkillCategorySettingRecord,
  type SkillTagSettingRecord,
} from './settings.api';
import { RecruitmentSettingsSection } from './RecruitmentSettingsSection';
import './SettingsPage.css';

type SettingsSectionId = 'overview' | 'features' | 'skills' | 'recruitment';

interface SettingsSectionMeta {
  id: SettingsSectionId;
  to: string;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
}

interface SkillCategoryFormState {
  code: string;
  name: string;
  description: string;
  displayOrder: string;
  isActive: boolean;
}

interface SkillTagFormState {
  categoryId: string;
  code: string;
  name: string;
  description: string;
  displayOrder: string;
  isActive: boolean;
}

interface RecruitmentOverviewState {
  requestTypes: RequestTypeRecord[];
  fundingTypes: FundingTypeRecord[];
  ruleSets: ApprovalRuleSetRecord[];
}

interface RecentActivity {
  id: string;
  title: string;
  detail: string;
  domain: string;
  updatedAt: string | null;
}

const settingsSections: SettingsSectionMeta[] = [
  {
    id: 'overview',
    to: '/settings',
    label: 'Overview',
    eyebrow: 'Administration',
    title: 'Settings Overview',
    description: 'Centralize feature availability, shared taxonomies, and recruitment routing in one structured admin console.',
  },
  {
    id: 'features',
    to: '/settings/features',
    label: 'Access & Features',
    eyebrow: 'Administration',
    title: 'Access & Features',
    description: 'Control which workspaces and actions are available without changing code or leaving the admin console.',
  },
  {
    id: 'skills',
    to: '/settings/skills',
    label: 'Skills Taxonomy',
    eyebrow: 'Talent Taxonomy',
    title: 'Skills Taxonomy',
    description: 'Manage the shared skills structure used by employee profiles, manager validation, and learning content tagging.',
  },
  {
    id: 'recruitment',
    to: '/settings/recruitment',
    label: 'Recruitment Configuration',
    eyebrow: 'Recruitment',
    title: 'Recruitment Configuration',
    description: 'Configure request intake types, funding models, and approval rule sets from a focused workspace.',
  },
];

const emptyCategoryForm: SkillCategoryFormState = {
  code: '',
  name: '',
  description: '',
  displayOrder: '0',
  isActive: true,
};

const emptyTagForm: SkillTagFormState = {
  categoryId: '',
  code: '',
  name: '',
  description: '',
  displayOrder: '0',
  isActive: true,
};

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not changed yet';
  }

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

const skillAccentPalette = ['#0b7a43', '#125e9a', '#45a9de', '#ffd64d', '#1fba88', '#f59e0b', '#ef4444', '#1da7c9', '#64748b'];

function getSkillAccent(index: number) {
  return skillAccentPalette[index % skillAccentPalette.length];
}

function getActiveSection(pathname: string): SettingsSectionId {
  const normalizedPath = pathname.replace(/\/+$/, '');
  const segments = normalizedPath.split('/').filter(Boolean);
  const section = segments[1];

  if (section === 'features' || section === 'skills' || section === 'recruitment') {
    return section;
  }

  return 'overview';
}

export function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refreshInboxSummary, refreshSession } = useAppSession();
  const activeSection = useMemo(() => getActiveSection(location.pathname), [location.pathname]);
  const activeSectionMeta = useMemo(
    () => settingsSections.find((section) => section.id === activeSection) ?? settingsSections[0],
    [activeSection],
  );

  const [features, setFeatures] = useState<FeatureState[]>([]);
  const [skillCategories, setSkillCategories] = useState<SkillCategorySettingRecord[]>([]);
  const [recruitmentOverview, setRecruitmentOverview] = useState<RecruitmentOverviewState>({
    requestTypes: [],
    fundingTypes: [],
    ruleSets: [],
  });
  const [loadedSections, setLoadedSections] = useState<Record<SettingsSectionId, boolean>>({
    overview: false,
    features: false,
    skills: false,
    recruitment: false,
  });
  const [loadingSections, setLoadingSections] = useState<Record<SettingsSectionId, boolean>>({
    overview: false,
    features: false,
    skills: false,
    recruitment: false,
  });
  const [pageError, setPageError] = useState<string | null>(null);
  const [toggleTarget, setToggleTarget] = useState<FeatureState | null>(null);
  const [toggleSaving, setToggleSaving] = useState(false);

  const setSectionLoading = useCallback((section: SettingsSectionId, isLoading: boolean) => {
    setLoadingSections((current) => ({ ...current, [section]: isLoading }));
  }, []);

  const markSectionLoaded = useCallback((sections: SettingsSectionId[]) => {
    setLoadedSections((current) => sections.reduce<Record<SettingsSectionId, boolean>>(
      (next, section) => ({ ...next, [section]: true }),
      current,
    ));
  }, []);

  const loadFeatures = useCallback(async (force = false) => {
    if (loadedSections.features && !force) {
      return;
    }

    setSectionLoading('features', true);
    setPageError(null);

    try {
      const nextFeatures = await listFeatureSettings();
      setFeatures(nextFeatures);
      markSectionLoaded(['features']);
    } catch (loadError) {
      setPageError(loadError instanceof Error ? loadError.message : 'Unable to load feature settings.');
    } finally {
      setSectionLoading('features', false);
    }
  }, [loadedSections.features, markSectionLoaded, setSectionLoading]);

  const loadSkills = useCallback(async (force = false) => {
    if (loadedSections.skills && !force) {
      return;
    }

    setSectionLoading('skills', true);
    setPageError(null);

    try {
      const nextSkills = await listSkillSettings();
      setSkillCategories(nextSkills);
      markSectionLoaded(['skills']);
    } catch (loadError) {
      setPageError(loadError instanceof Error ? loadError.message : 'Unable to load skills taxonomy.');
    } finally {
      setSectionLoading('skills', false);
    }
  }, [loadedSections.skills, markSectionLoaded, setSectionLoading]);

  const loadRecruitmentOverview = useCallback(async (force = false) => {
    if (loadedSections.recruitment && !force) {
      return;
    }

    setSectionLoading('recruitment', true);
    setPageError(null);

    try {
      const [requestTypes, fundingTypes, ruleSets] = await Promise.all([
        listRequestTypes(),
        listFundingTypes(),
        listApprovalRuleSets(),
      ]);

      setRecruitmentOverview({ requestTypes, fundingTypes, ruleSets });
      markSectionLoaded(['recruitment']);
    } catch (loadError) {
      setPageError(loadError instanceof Error ? loadError.message : 'Unable to load recruitment configuration.');
    } finally {
      setSectionLoading('recruitment', false);
    }
  }, [loadedSections.recruitment, markSectionLoaded, setSectionLoading]);

  const loadOverview = useCallback(async (force = false) => {
    if (loadedSections.overview && !force) {
      return;
    }

    setSectionLoading('overview', true);
    setPageError(null);

    try {
      const [nextFeatures, nextSkillCategories, requestTypes, fundingTypes, ruleSets] = await Promise.all([
        listFeatureSettings(),
        listSkillSettings(),
        listRequestTypes(),
        listFundingTypes(),
        listApprovalRuleSets(),
      ]);

      setFeatures(nextFeatures);
      setSkillCategories(nextSkillCategories);
      setRecruitmentOverview({ requestTypes, fundingTypes, ruleSets });
      markSectionLoaded(['overview', 'features', 'skills', 'recruitment']);
    } catch (loadError) {
      setPageError(loadError instanceof Error ? loadError.message : 'Unable to load settings overview.');
    } finally {
      setSectionLoading('overview', false);
    }
  }, [loadedSections.overview, markSectionLoaded, setSectionLoading]);

  useEffect(() => {
    if (activeSection === 'overview') {
      void loadOverview();
      return;
    }

    if (activeSection === 'features') {
      void loadFeatures();
      return;
    }

    if (activeSection === 'skills') {
      void loadSkills();
      return;
    }

    void loadRecruitmentOverview();
  }, [activeSection, loadFeatures, loadOverview, loadRecruitmentOverview, loadSkills]);

  const confirmToggle = useCallback(async () => {
    if (!toggleTarget) {
      return;
    }

    setToggleSaving(true);
    setPageError(null);

    try {
      const updatedFeature = await updateFeatureSetting(toggleTarget.key, !toggleTarget.enabled);
      setFeatures((current) => current.map((feature) => (feature.key === updatedFeature.key ? updatedFeature : feature)));
      setToggleTarget(null);
      await Promise.all([refreshSession(), refreshInboxSummary()]);
    } catch (saveError) {
      setPageError(saveError instanceof Error ? saveError.message : 'Unable to update the feature setting.');
    } finally {
      setToggleSaving(false);
    }
  }, [refreshInboxSummary, refreshSession, toggleTarget]);

  const recentActivity = useMemo<RecentActivity[]>(() => {
    const items: RecentActivity[] = [];

    for (const feature of features) {
      items.push({
        id: `feature-${feature.key}`,
        title: feature.label,
        detail: `${feature.enabled ? 'Enabled' : 'Disabled'} feature toggle`,
        domain: 'Access & Features',
        updatedAt: feature.updatedAt,
      });
    }

    for (const category of skillCategories) {
      items.push({
        id: `skill-category-${category.id}`,
        title: category.name,
        detail: `${category.tags.length} skill tags in taxonomy`,
        domain: 'Skills Taxonomy',
        updatedAt: category.updatedAt,
      });
    }

    for (const ruleSet of recruitmentOverview.ruleSets) {
      items.push({
        id: `rule-set-${ruleSet.id}`,
        title: ruleSet.name,
        detail: `${ruleSet.rules.length} routing rules in ${ruleSet.status.toLowerCase()} status`,
        domain: 'Recruitment Configuration',
        updatedAt: ruleSet.updatedAt,
      });
    }

    return items
      .sort((left, right) => {
        const leftValue = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
        const rightValue = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
        return rightValue - leftValue;
      })
      .slice(0, 6);
  }, [features, recruitmentOverview.ruleSets, skillCategories]);

  const content = (() => {
    if (activeSection === 'overview') {
      return (
        <OverviewSection
          loading={loadingSections.overview}
          features={features}
          skillCategories={skillCategories}
          recruitmentOverview={recruitmentOverview}
          recentActivity={recentActivity}
          onNavigate={navigate}
          onRefresh={() => void loadOverview(true)}
        />
      );
    }

    if (activeSection === 'features') {
      return (
        <FeaturesSection
          features={features}
          loading={loadingSections.features}
          onRefresh={() => void loadFeatures(true)}
          onToggle={setToggleTarget}
        />
      );
    }

    if (activeSection === 'skills') {
      return (
        <SkillsSection
          skillCategories={skillCategories}
          loading={loadingSections.skills}
          onRefresh={() => void loadSkills(true)}
          onSkillCategoriesChange={setSkillCategories}
        />
      );
    }

    return <RecruitmentSettingsSection />;
  })();

  return (
    <div className="settings-console">
      <aside className="settings-console-sidebar card">
        <div className="settings-console-sidebar-header">
          <span className="settings-eyebrow">Admin Console</span>
          <h2 className="card-title">Settings</h2>
          <p className="card-subtitle">Use one structured console instead of one long stacked admin page.</p>
        </div>

        <nav className="settings-console-nav" aria-label="Settings sections">
          {settingsSections.map((section) => {
            const isActive = section.id === activeSection;

            return (
              <button
                key={section.id}
                type="button"
                className={`settings-console-nav-item ${isActive ? 'settings-console-nav-item-active' : ''}`}
                onClick={() => navigate(section.to)}
              >
                <div>
                  <strong>{section.label}</strong>
                  <p>{section.description}</p>
                </div>
                <ChevronRight size={16} />
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="settings-console-main">
        <section className="card settings-hero">
          <div className="settings-hero-copy">
            <span className="settings-eyebrow">{activeSectionMeta.eyebrow}</span>
            <div className="settings-hero-header">
              <div>
                <h1 className="card-title">{activeSectionMeta.title}</h1>
                <p className="card-subtitle">{activeSectionMeta.description}</p>
              </div>
              <div className="settings-hero-badge">
                <Settings2 size={18} />
                <span>{activeSectionMeta.label}</span>
              </div>
            </div>
          </div>
        </section>

        {pageError ? (
          <div className="settings-banner settings-banner-error">
            <ShieldAlert size={16} />
            <span>{pageError}</span>
          </div>
        ) : null}

        {content}
      </main>

      {toggleTarget ? (
        <div className="settings-overlay" role="presentation">
          <div className="settings-modal card" role="dialog" aria-modal="true" aria-labelledby="settings-feature-toggle-title">
            <div className="settings-modal-copy">
              <span className="settings-eyebrow">Confirm change</span>
              <h2 id="settings-feature-toggle-title" className="card-title">
                {toggleTarget.enabled ? `Disable ${toggleTarget.label}?` : `Enable ${toggleTarget.label}?`}
              </h2>
              <p className="card-subtitle">{toggleTarget.description}</p>
              <p className="settings-modal-impact">Impact: {toggleTarget.impacts.join(' • ')}</p>
              {toggleTarget.routes.length > 0 ? (
                <p className="settings-modal-impact">Routes: {toggleTarget.routes.join(', ')}</p>
              ) : null}
            </div>

            <div className="settings-dialog-actions">
              <button type="button" className="button button-outline" onClick={() => setToggleTarget(null)} disabled={toggleSaving}>Cancel</button>
              <button type="button" className="button" onClick={() => void confirmToggle()} disabled={toggleSaving}>
                {toggleSaving ? 'Saving...' : toggleTarget.enabled ? 'Disable feature' : 'Enable feature'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OverviewSection({
  loading,
  features,
  skillCategories,
  recruitmentOverview,
  recentActivity,
  onNavigate,
  onRefresh,
}: {
  loading: boolean;
  features: FeatureState[];
  skillCategories: SkillCategorySettingRecord[];
  recruitmentOverview: RecruitmentOverviewState;
  recentActivity: RecentActivity[];
  onNavigate: (to: string) => void;
  onRefresh: () => void;
}) {
  const activeSkillCount = useMemo(
    () => skillCategories.flatMap((category) => category.tags).filter((tag) => tag.isActive).length,
    [skillCategories],
  );
  const enabledFeatureCount = useMemo(
    () => features.filter((feature) => feature.enabled).length,
    [features],
  );
  const activeRuleSetCount = useMemo(
    () => recruitmentOverview.ruleSets.filter((ruleSet) => ruleSet.status === 'Active').length,
    [recruitmentOverview.ruleSets],
  );

  return (
    <section className="settings-section-stack">
      <div className="card settings-section-card">
        <div className="settings-section-toolbar">
          <div>
            <h2 className="card-title">Overview</h2>
            <p className="card-subtitle">Start with counts, recent admin activity, and direct links into each configuration area.</p>
          </div>
          <button type="button" className="button button-outline" onClick={onRefresh}>
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>

        {loading ? (
          <LoadingState label="Loading settings overview..." />
        ) : (
          <>
            <div className="settings-summary-grid">
              <article className="settings-summary-card">
                <span className="settings-summary-label">Access & Features</span>
                <strong className="settings-summary-value">{enabledFeatureCount}/{features.length || 0}</strong>
                <p className="settings-summary-detail">Enabled features across workspaces and subfeatures currently managed in the app.</p>
              </article>
              <article className="settings-summary-card">
                <span className="settings-summary-label">Skills Taxonomy</span>
                <strong className="settings-summary-value">{skillCategories.length}</strong>
                <p className="settings-summary-detail">{activeSkillCount} active skill tags mapped across employee skills and learning content.</p>
              </article>
              <article className="settings-summary-card">
                <span className="settings-summary-label">Recruitment Config</span>
                <strong className="settings-summary-value">{recruitmentOverview.requestTypes.length}</strong>
                <p className="settings-summary-detail">{recruitmentOverview.fundingTypes.length} funding types and {recruitmentOverview.ruleSets.length} rule sets configured.</p>
              </article>
              <article className="settings-summary-card">
                <span className="settings-summary-label">Active Routing</span>
                <strong className="settings-summary-value">{activeRuleSetCount}</strong>
                <p className="settings-summary-detail">Published approval rule sets currently available for request routing and simulation.</p>
              </article>
            </div>

            <div className="settings-overview-grid">
              <div className="card settings-overview-surface">
                <div className="settings-section-toolbar settings-section-toolbar-compact">
                  <div>
                    <h3 className="card-title">Quick Links</h3>
                    <p className="card-subtitle">Jump directly into the admin area you need without scrolling a long page.</p>
                  </div>
                </div>
                <div className="settings-quick-links">
                  {settingsSections.filter((section) => section.id !== 'overview').map((section) => (
                    <button key={section.id} type="button" className="settings-quick-link" onClick={() => onNavigate(section.to)}>
                      <div>
                        <strong>{section.label}</strong>
                        <p>{section.description}</p>
                      </div>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="card settings-overview-surface">
                <div className="settings-section-toolbar settings-section-toolbar-compact">
                  <div>
                    <h3 className="card-title">Recent Changes</h3>
                    <p className="card-subtitle">Latest activity across feature toggles, taxonomy, and routing configuration.</p>
                  </div>
                </div>
                {recentActivity.length > 0 ? (
                  <div className="settings-activity-list">
                    {recentActivity.map((item) => (
                      <article key={item.id} className="settings-activity-item">
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.detail}</p>
                        </div>
                        <div className="settings-activity-meta">
                          <span>{item.domain}</span>
                          <span>{formatDateTime(item.updatedAt)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No recent changes"
                    description="Updates will appear here once feature toggles, taxonomy records, or rule sets are modified."
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function FeaturesSection({
  features,
  loading,
  onRefresh,
  onToggle,
}: {
  features: FeatureState[];
  loading: boolean;
  onRefresh: () => void;
  onToggle: (feature: FeatureState) => void;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'workspace' | 'subfeature'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [expandedFeatureKey, setExpandedFeatureKey] = useState<string | null>(null);

  const visibleFeatures = useMemo(() => features.filter((feature) => {
    if (typeFilter !== 'all' && feature.featureType !== typeFilter) {
      return false;
    }

    if (statusFilter === 'enabled' && !feature.enabled) {
      return false;
    }

    if (statusFilter === 'disabled' && feature.enabled) {
      return false;
    }

    if (!search.trim()) {
      return true;
    }

    return `${feature.label} ${feature.description} ${feature.key}`.toLowerCase().includes(search.trim().toLowerCase());
  }), [features, search, statusFilter, typeFilter]);

  return (
    <section className="settings-section-stack">
      <div className="card settings-section-card">
        <div className="settings-section-toolbar">
          <div>
            <h2 className="card-title">Access & Features</h2>
            <p className="card-subtitle">Use a denser management list for workspace and subfeature controls instead of large stacked cards.</p>
          </div>
          <button type="button" className="button button-outline" onClick={onRefresh}>
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>

        <div className="settings-toolbar-grid">
          <label className="settings-toolbar-field">
            <span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by label, key, or description" />
          </label>
          <label className="settings-toolbar-field">
            <span>Type</span>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | 'workspace' | 'subfeature')}>
              <option value="all">All features</option>
              <option value="workspace">Workspaces</option>
              <option value="subfeature">Subfeatures</option>
            </select>
          </label>
          <label className="settings-toolbar-field">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | 'enabled' | 'disabled')}>
              <option value="all">Enabled and disabled</option>
              <option value="enabled">Enabled only</option>
              <option value="disabled">Disabled only</option>
            </select>
          </label>
        </div>

        {loading ? (
          <LoadingState label="Loading feature settings..." />
        ) : (
          <div className="settings-record-list">
            <div className="settings-record-head settings-record-grid-features">
              <span>Feature</span>
              <span>Type</span>
              <span>Status</span>
              <span>Updated</span>
              <span>Action</span>
            </div>
            {visibleFeatures.length > 0 ? visibleFeatures.map((feature) => {
              const expanded = expandedFeatureKey === feature.key;

              return (
                <div key={feature.key} className="settings-record-cluster">
                  <article className="settings-record-row settings-record-grid-features">
                    <div>
                      <strong>{feature.label}</strong>
                      <p>{feature.key}</p>
                    </div>
                    <span className="settings-record-muted">{feature.featureType === 'workspace' ? 'Workspace' : 'Subfeature'}</span>
                    <span className={`badge ${feature.enabled ? 'badge-success' : 'badge-warning'}`}>{feature.enabled ? 'Enabled' : 'Disabled'}</span>
                    <span className="settings-record-muted">{formatDateTime(feature.updatedAt)}</span>
                    <div className="settings-record-actions">
                      <button type="button" className="button button-outline button-small" onClick={() => setExpandedFeatureKey(expanded ? null : feature.key)}>
                        {expanded ? 'Hide details' : 'Details'}
                      </button>
                      <button type="button" className="button button-small" onClick={() => onToggle(feature)}>
                        {feature.enabled ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </article>
                  {expanded ? (
                    <div className="settings-record-detail">
                      <p>{feature.description}</p>
                      <div className="settings-impact-list">
                        {feature.impacts.map((impact) => (
                          <span key={impact} className="settings-impact-pill">{impact}</span>
                        ))}
                      </div>
                      <div className="settings-route-list">
                        <strong>Routes</strong>
                        <div className="settings-route-pills">
                          {feature.routes.length > 0 ? feature.routes.map((route) => (
                            <span key={route} className="settings-route-pill">{route}</span>
                          )) : <span className="settings-record-muted">No direct route mapping</span>}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            }) : (
              <EmptyState
                title="No matching features"
                description="Try a different filter or search query to locate the feature you need."
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function SkillsSection({
  skillCategories,
  loading,
  onRefresh,
  onSkillCategoriesChange,
}: {
  skillCategories: SkillCategorySettingRecord[];
  loading: boolean;
  onRefresh: () => void;
  onSkillCategoriesChange: (records: SkillCategorySettingRecord[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<SkillCategorySettingRecord | null>(null);
  const [editingTag, setEditingTag] = useState<SkillTagSettingRecord | null>(null);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState<SkillCategoryFormState>(emptyCategoryForm);
  const [tagForm, setTagForm] = useState<SkillTagFormState>(emptyTagForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredCategories = useMemo(() => skillCategories.filter((category) => {
    if (statusFilter === 'active' && !category.isActive) {
      return false;
    }

    if (statusFilter === 'archived' && category.isActive) {
      return false;
    }

    if (!search.trim()) {
      return true;
    }

    const normalizedSearch = search.trim().toLowerCase();
    const categoryMatch = `${category.name} ${category.code} ${category.description ?? ''}`.toLowerCase().includes(normalizedSearch);
    const tagMatch = category.tags.some((tag) => `${tag.name} ${tag.code} ${tag.description ?? ''}`.toLowerCase().includes(normalizedSearch));
    return categoryMatch || tagMatch;
  }), [search, skillCategories, statusFilter]);

  useEffect(() => {
    if (!expandedCategoryId && filteredCategories[0]) {
      setExpandedCategoryId(filteredCategories[0].id);
      return;
    }

    if (expandedCategoryId && !skillCategories.some((category) => category.id === expandedCategoryId)) {
      setExpandedCategoryId(filteredCategories[0]?.id ?? null);
    }
  }, [expandedCategoryId, filteredCategories, skillCategories]);

  const expandedCategory = useMemo(
    () => skillCategories.find((category) => category.id === expandedCategoryId) ?? null,
    [expandedCategoryId, skillCategories],
  );

  const getVisibleTags = useCallback((category: SkillCategorySettingRecord) => category.tags.filter((tag) => {
      if (statusFilter === 'active' && !tag.isActive) {
        return false;
      }

      if (statusFilter === 'archived' && tag.isActive) {
        return false;
      }

      if (!search.trim()) {
        return true;
      }

      return `${tag.name} ${tag.code} ${tag.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase());
    }), [search, statusFilter]);

  const openCategoryEditor = (category?: SkillCategorySettingRecord) => {
    setError(null);
    setEditingCategory(category ?? null);
    setCategoryForm(category ? {
      code: category.code,
      name: category.name,
      description: category.description ?? '',
      displayOrder: String(category.displayOrder),
      isActive: category.isActive,
    } : emptyCategoryForm);
    setCategoryDrawerOpen(true);
  };

  const openTagEditor = (tag?: SkillTagSettingRecord, categoryId?: string) => {
    const nextCategoryId = categoryId ?? expandedCategory?.id ?? '';
    setError(null);
    setEditingTag(tag ?? null);
    setTagForm(tag ? {
      categoryId: nextCategoryId,
      code: tag.code,
      name: tag.name,
      description: tag.description ?? '',
      displayOrder: String(tag.displayOrder),
      isActive: tag.isActive,
    } : {
      ...emptyTagForm,
      categoryId: nextCategoryId,
    });
    setExpandedCategoryId(nextCategoryId);
    setTagEditorOpen(true);
  };

  const closeCategoryEditor = () => {
    setCategoryDrawerOpen(false);
    setEditingCategory(null);
    setCategoryForm(emptyCategoryForm);
  };

  const closeTagEditor = () => {
    setTagEditorOpen(false);
    setEditingTag(null);
    setTagForm(emptyTagForm);
  };

  const saveCategory = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        code: categoryForm.code.trim(),
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim() || null,
        displayOrder: Number(categoryForm.displayOrder || '0'),
        isActive: categoryForm.isActive,
      };

      const nextCategories = editingCategory
        ? await updateSkillCategory(editingCategory.id, payload)
        : await createSkillCategory(payload);

      onSkillCategoriesChange(nextCategories);
      setExpandedCategoryId(editingCategory?.id ?? nextCategories[0]?.id ?? null);
      closeCategoryEditor();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the skill category.');
    } finally {
      setSaving(false);
    }
  };

  const saveTag = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        categoryId: tagForm.categoryId,
        code: tagForm.code.trim(),
        name: tagForm.name.trim(),
        description: tagForm.description.trim() || null,
        displayOrder: Number(tagForm.displayOrder || '0'),
        isActive: tagForm.isActive,
      };

      const nextCategories = editingTag
        ? await updateSkillTag(editingTag.id, payload)
        : await createSkillTag(payload);

      onSkillCategoriesChange(nextCategories);
      setExpandedCategoryId(tagForm.categoryId || expandedCategory?.id || nextCategories[0]?.id || null);
      closeTagEditor();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the skill.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="settings-section-stack">
      {error ? (
        <div className="settings-banner settings-banner-error">
          <ShieldAlert size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="card settings-section-card">
        <div className="settings-section-toolbar">
          <div>
            <h2 className="card-title">Skills Taxonomy</h2>
            <p className="card-subtitle">Manage the taxonomy as grouped domains with inline tag administration instead of splitting categories and details into separate columns.</p>
          </div>
          <button type="button" className="button button-outline" onClick={onRefresh}>
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>

        {loading ? (
          <LoadingState label="Loading skills taxonomy..." />
        ) : (
          <>
            <div className="settings-skill-toolbar">
              <label className="settings-search-field">
                <Search size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tags, aliases..." />
              </label>

              <div className="settings-toolbar-actions">
                <label className="settings-toolbar-field settings-toolbar-field-inline">
                  <span>Status</span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'archived')}>
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <button type="button" className="button settings-skill-add-group" onClick={() => openCategoryEditor()}>
                  <Plus size={16} />
                  Add Group
                </button>
              </div>
            </div>

            <div className="settings-reference-note">
              This taxonomy is shared across employee self-identification, manager validation, and learning content tagging. Employees do not see manager validation status on their own profile.
            </div>

            <div className="settings-skill-groups">
              {filteredCategories.length > 0 ? filteredCategories.map((category) => {
                const expanded = expandedCategoryId === category.id;
                const visibleTags = getVisibleTags(category);

                return (
                  <article key={category.id} className={`settings-skill-group-card ${expanded ? 'settings-skill-group-card-active' : ''}`}>
                    <div className="settings-skill-group-header">
                      <button type="button" className="settings-skill-group-toggle" onClick={() => setExpandedCategoryId(expanded ? null : category.id)}>
                        <span className="settings-skill-group-chevron">
                          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                        <div className="settings-skill-group-title">
                          <strong>{category.name}</strong>
                          <span className="settings-skill-count">{category.tags.length} tags</span>
                        </div>
                      </button>

                      <div className="settings-skill-group-actions">
                        <button type="button" className="settings-icon-button" onClick={() => openTagEditor(undefined, category.id)} aria-label={`Add skill to ${category.name}`}>
                          <Plus size={16} />
                        </button>
                        <button type="button" className="settings-icon-button" onClick={() => openCategoryEditor(category)} aria-label={`Edit ${category.name}`}>
                          <PencilLine size={16} />
                        </button>
                      </div>
                    </div>

                    {expanded ? (
                      <div className="settings-skill-group-body">
                        {category.description ? <p className="settings-skill-group-description">{category.description}</p> : null}

                        {tagEditorOpen && tagForm.categoryId === category.id ? (
                          <div className="settings-skill-editor-card">
                            <div className="settings-skill-palette" aria-hidden="true">
                              {skillAccentPalette.map((token) => (
                                <span key={token} className="settings-skill-palette-dot" style={{ backgroundColor: token }} />
                              ))}
                            </div>

                            <div className="settings-skill-editor-grid">
                              <label className="settings-toolbar-field">
                                <span>Skill name</span>
                                <input value={tagForm.name} onChange={(event) => setTagForm((current) => ({ ...current, name: event.target.value }))} placeholder="Virtual Care" />
                              </label>
                              <label className="settings-toolbar-field">
                                <span>Aliases / code</span>
                                <input value={tagForm.code} onChange={(event) => setTagForm((current) => ({ ...current, code: event.target.value }))} placeholder="VCF9, Telehealth" />
                              </label>
                              <label className="settings-toolbar-field">
                                <span>Status</span>
                                <select value={tagForm.isActive ? 'active' : 'archived'} onChange={(event) => setTagForm((current) => ({ ...current, isActive: event.target.value === 'active' }))}>
                                  <option value="active">Active</option>
                                  <option value="archived">Archived</option>
                                </select>
                              </label>
                              <label className="settings-toolbar-field">
                                <span>Display order</span>
                                <input type="number" min="0" max="999" value={tagForm.displayOrder} onChange={(event) => setTagForm((current) => ({ ...current, displayOrder: event.target.value }))} />
                              </label>
                              <label className="settings-toolbar-field settings-skill-editor-field-wide">
                                <span>Notes</span>
                                <textarea rows={3} value={tagForm.description} onChange={(event) => setTagForm((current) => ({ ...current, description: event.target.value }))} placeholder="Optional note or alias context" />
                              </label>
                            </div>

                            <div className="settings-skill-editor-actions">
                              <button type="button" className="button" onClick={() => void saveTag()} disabled={saving}>
                                {editingTag ? 'Save skill' : 'Add skill'}
                              </button>
                              <button type="button" className="button button-outline" onClick={closeTagEditor}>Cancel</button>
                            </div>
                          </div>
                        ) : null}

                        <div className="settings-skill-tag-list">
                          {visibleTags.length > 0 ? visibleTags.map((tag, index) => (
                            <article key={tag.id} className="settings-skill-tag-item">
                              <div className="settings-skill-tag-main">
                                <span className="settings-skill-tag-dot" style={{ backgroundColor: getSkillAccent(index) }} />
                                <div>
                                  <strong>{tag.name}</strong>
                                  <p>{tag.code}{tag.description ? ` • ${tag.description}` : ''}</p>
                                </div>
                              </div>

                              <div className="settings-skill-tag-meta">
                                <span className={`badge ${tag.isActive ? 'badge-success' : 'badge-warning'}`}>{tag.isActive ? 'Active' : 'Archived'}</span>
                                <button type="button" className="settings-icon-button" onClick={() => openTagEditor(tag, category.id)} aria-label={`Edit ${tag.name}`}>
                                  <PencilLine size={16} />
                                </button>
                              </div>
                            </article>
                          )) : (
                            <EmptyState
                              title="No matching tags"
                              description="Adjust the search or add a new tag to this group."
                            />
                          )}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              }) : (
                <EmptyState
                  title="No matching groups"
                  description="Adjust the search or add a new category to start the taxonomy."
                />
              )}
            </div>
          </>
        )}
      </div>

      {categoryDrawerOpen ? (
        <Drawer
          title={editingCategory ? 'Edit skill group' : 'Create skill group'}
          subtitle="Groups organize the shared taxonomy used by employee skills and learning content."
          onClose={closeCategoryEditor}
          footer={(
            <>
              <button type="button" className="button button-outline" onClick={closeCategoryEditor}>Cancel</button>
              <button type="button" className="button" onClick={() => void saveCategory()} disabled={saving}>Save group</button>
            </>
          )}
        >
          <DrawerField label="Code">
            <input value={categoryForm.code} onChange={(event) => setCategoryForm((current) => ({ ...current, code: event.target.value }))} />
          </DrawerField>
          <DrawerField label="Name">
            <input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} />
          </DrawerField>
          <DrawerField label="Display order">
            <input type="number" min="0" max="999" value={categoryForm.displayOrder} onChange={(event) => setCategoryForm((current) => ({ ...current, displayOrder: event.target.value }))} />
          </DrawerField>
          <DrawerField label="Status">
            <select value={categoryForm.isActive ? 'active' : 'archived'} onChange={(event) => setCategoryForm((current) => ({ ...current, isActive: event.target.value === 'active' }))}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </DrawerField>
          <DrawerField label="Description" fullWidth>
            <textarea rows={4} value={categoryForm.description} onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))} />
          </DrawerField>
        </Drawer>
      ) : null}

    </section>
  );
}

function Drawer({
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="settings-overlay settings-overlay-drawer" role="presentation">
      <div className="settings-drawer" role="dialog" aria-modal="true">
        <div className="settings-drawer-header">
          <div>
            <h2 className="card-title">{title}</h2>
            <p className="card-subtitle">{subtitle}</p>
          </div>
          <button type="button" className="button button-outline button-small" onClick={onClose}>Close</button>
        </div>
        <div className="settings-drawer-body">{children}</div>
        <div className="settings-drawer-footer">{footer}</div>
      </div>
    </div>
  );
}

function DrawerField({ label, children, fullWidth = false }: { label: string; children: ReactNode; fullWidth?: boolean }) {
  return (
    <label className={`settings-drawer-field ${fullWidth ? 'settings-drawer-field-full' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="settings-state">
      <LoaderCircle className="settings-spin" size={18} />
      <span>{label}</span>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="settings-empty-state">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
