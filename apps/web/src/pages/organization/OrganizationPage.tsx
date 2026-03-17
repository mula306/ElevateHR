import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Building2,
  CheckCircle2,
  GitBranch,
  Layers3,
  LoaderCircle,
  PencilLine,
  Plus,
  Search,
  ShieldAlert,
  UsersRound,
  Waypoints,
  X,
} from 'lucide-react';
import {
  archiveClassification,
  archiveLevel,
  archiveOrgUnit,
  archivePosition,
  createClassification,
  createLevel,
  createOrgUnit,
  createPosition,
  getOrganizationSnapshot,
  listClassifications,
  listEmployeeOptions,
  listLevels,
  listOrgUnits,
  listPositions,
  restoreClassification,
  restoreLevel,
  restoreOrgUnit,
  restorePosition,
  updateClassification,
  updateLevel,
  updateOrgUnit,
  updatePosition,
  type ClassificationPayload,
  type ClassificationRecord,
  type EmployeeOption,
  type LevelPayload,
  type LevelRecord,
  type OrganizationSnapshot,
  type OrgUnitNode,
  type OrgUnitPayload,
  type OrgUnitRecord,
  type PositionPayload,
  type PositionRecord,
  type PositionStatus,
} from './organization.api';
import './OrganizationPage.css';

type OrganizationTab = 'overview' | 'orgUnits' | 'positions' | 'classifications' | 'archived';
type StructureView = 'chart' | 'structure';
type VacancyFilter = 'All' | 'Open seats' | 'Fully filled';
type ArchiveEntity = 'orgUnit' | 'position' | 'classification' | 'level';

type PanelState =
  | { kind: 'inspectPosition'; positionId: string }
  | { kind: 'orgUnitForm'; mode: 'create' | 'edit'; orgUnitId?: string }
  | { kind: 'positionForm'; mode: 'create' | 'edit'; positionId?: string }
  | { kind: 'classificationForm'; mode: 'create' | 'edit'; classificationId?: string }
  | { kind: 'levelForm'; mode: 'create' | 'edit'; levelId?: string }
  | null;

interface NoticeState {
  tone: 'success' | 'error';
  message: string;
}

interface ArchiveState {
  entity: ArchiveEntity;
  id: string;
  label: string;
  title: string;
  subtitle: string;
}

interface OrgUnitFormState {
  code: string;
  name: string;
  type: string;
  parentId: string;
}

interface PositionFormState {
  positionCode: string;
  title: string;
  orgUnitId: string;
  classificationId: string;
  levelId: string;
  reportsToPositionId: string;
  headcount: string;
  positionStatus: PositionStatus;
  incumbentEmployeeIds: string[];
}

interface ClassificationFormState {
  code: string;
  title: string;
  occupationCode: string;
  annualHours: string;
  family: string;
  description: string;
}

interface LevelFormState {
  classificationId: string;
  levelCode: string;
  currency: string;
  rangeMin: string;
  rangeMid: string;
  rangeMax: string;
}

interface FlatOrgUnitRow {
  unit: OrgUnitRecord;
  depth: number;
}

interface PositionChartNode {
  position: PositionRecord;
  children: PositionChartNode[];
}

const tabs: Array<{ id: OrganizationTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'orgUnits', label: 'Org Units' },
  { id: 'positions', label: 'Positions' },
  { id: 'classifications', label: 'Classifications' },
  { id: 'archived', label: 'Archived' },
];

const emptyOrgUnitForm: OrgUnitFormState = {
  code: '',
  name: '',
  type: 'Department',
  parentId: '',
};

const emptyPositionForm: PositionFormState = {
  positionCode: '',
  title: '',
  orgUnitId: '',
  classificationId: '',
  levelId: '',
  reportsToPositionId: '',
  headcount: '1',
  positionStatus: 'Active',
  incumbentEmployeeIds: [],
};

const emptyClassificationForm: ClassificationFormState = {
  code: '',
  title: '',
  occupationCode: '',
  annualHours: '1972',
  family: '',
  description: '',
};

const emptyLevelForm: LevelFormState = {
  classificationId: '',
  levelCode: '',
  currency: 'CAD',
  rangeMin: '',
  rangeMid: '',
  rangeMax: '',
};

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatAnnualHours(value: number) {
  return new Intl.NumberFormat('en-CA', {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatHourlyRate(value: number, currency: string) {
  return `${formatCurrency(value, currency)} / hr`;
}

function getPositionTone(position: PositionRecord) {
  if (position.recordStatus === 'Archived') {
    return 'badge-danger';
  }

  if (position.vacancyCount > 0) {
    return 'badge-warning';
  }

  return 'badge-success';
}

function buildPositionChart(positions: PositionRecord[]) {
  const nodesById = new Map<string, PositionChartNode>();

  positions.forEach((position) => {
    nodesById.set(position.id, { position, children: [] });
  });

  const roots: PositionChartNode[] = [];

  nodesById.forEach((node) => {
    const parentId = node.position.reportsToPosition?.id;
    if (!parentId) {
      roots.push(node);
      return;
    }

    const parent = nodesById.get(parentId);
    if (!parent) {
      roots.push(node);
      return;
    }

    parent.children.push(node);
  });

  const sortTree = (nodes: PositionChartNode[]) => {
    nodes.sort((left, right) => left.position.title.localeCompare(right.position.title));
    nodes.forEach((node) => sortTree(node.children));
  };

  sortTree(roots);

  return roots;
}

function flattenOrgUnitTree(nodes: OrgUnitRecord[], parentId: string | null = null, depth = 0): FlatOrgUnitRow[] {
  return nodes
    .filter((unit) => unit.parentId === parentId)
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((unit) => [
      { unit, depth },
      ...flattenOrgUnitTree(nodes, unit.id, depth + 1),
    ]);
}

function matchesText(value: string, search: string) {
  return value.toLowerCase().includes(search.toLowerCase());
}

export function OrganizationPage() {
  const [tab, setTab] = useState<OrganizationTab>('overview');
  const [structureView, setStructureView] = useState<StructureView>('chart');
  const [snapshot, setSnapshot] = useState<OrganizationSnapshot | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [classifications, setClassifications] = useState<ClassificationRecord[]>([]);
  const [levels, setLevels] = useState<LevelRecord[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [panel, setPanel] = useState<PanelState>(null);
  const [archiveState, setArchiveState] = useState<ArchiveState | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [orgUnitSearch, setOrgUnitSearch] = useState('');
  const [positionSearch, setPositionSearch] = useState('');
  const [positionOrgUnitFilter, setPositionOrgUnitFilter] = useState('');
  const [positionClassificationFilter, setPositionClassificationFilter] = useState('');
  const [vacancyFilter, setVacancyFilter] = useState<VacancyFilter>('All');
  const [classificationSearch, setClassificationSearch] = useState('');
  const [archivedSearch, setArchivedSearch] = useState('');
  const [orgUnitForm, setOrgUnitForm] = useState<OrgUnitFormState>(emptyOrgUnitForm);
  const [positionForm, setPositionForm] = useState<PositionFormState>(emptyPositionForm);
  const [classificationForm, setClassificationForm] = useState<ClassificationFormState>(emptyClassificationForm);
  const [levelForm, setLevelForm] = useState<LevelFormState>(emptyLevelForm);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const [snapshotData, orgUnitsData, positionsData, classificationsData, levelsData, employeeData] = await Promise.all([
        getOrganizationSnapshot(),
        listOrgUnits(true),
        listPositions(true),
        listClassifications(true),
        listLevels(true),
        listEmployeeOptions(),
      ]);

      setSnapshot(snapshotData);
      setOrgUnits(orgUnitsData);
      setPositions(positionsData);
      setClassifications(classificationsData);
      setLevels(levelsData);
      setEmployeeOptions(employeeData);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load organization workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const activeOrgUnits = useMemo(() => orgUnits.filter((unit) => unit.recordStatus === 'Active'), [orgUnits]);
  const archivedOrgUnits = useMemo(() => orgUnits.filter((unit) => unit.recordStatus === 'Archived'), [orgUnits]);
  const activePositions = useMemo(() => positions.filter((position) => position.recordStatus === 'Active'), [positions]);
  const archivedPositions = useMemo(() => positions.filter((position) => position.recordStatus === 'Archived'), [positions]);
  const activeClassifications = useMemo(() => classifications.filter((classification) => classification.recordStatus === 'Active'), [classifications]);
  const archivedClassifications = useMemo(() => classifications.filter((classification) => classification.recordStatus === 'Archived'), [classifications]);
  const activeLevels = useMemo(() => levels.filter((level) => level.recordStatus === 'Active'), [levels]);
  const archivedLevels = useMemo(() => levels.filter((level) => level.recordStatus === 'Archived'), [levels]);

  const positionOptions = useMemo(() => activePositions.filter((position) => !panel || panel.kind !== 'positionForm' || position.id !== panel.positionId), [activePositions, panel]);
  const availableLevels = useMemo(() => {
    return activeLevels.filter((level) => level.classificationId === positionForm.classificationId);
  }, [activeLevels, positionForm.classificationId]);

  const chartRoots = useMemo(() => buildPositionChart(snapshot?.positions ?? activePositions), [activePositions, snapshot]);
  const orgUnitRows = useMemo(() => flattenOrgUnitTree(activeOrgUnits), [activeOrgUnits]);
  const selectedPosition = useMemo(() => {
    return panel?.kind === 'inspectPosition'
      ? activePositions.find((position) => position.id === panel.positionId) ?? null
      : null;
  }, [activePositions, panel]);

  const filteredOrgUnitRows = useMemo(() => {
    const search = orgUnitSearch.trim();

    if (!search) {
      return orgUnitRows;
    }

    return orgUnitRows.filter(({ unit }) => {
      return [unit.code, unit.name, unit.type].some((value) => matchesText(value, search));
    });
  }, [orgUnitRows, orgUnitSearch]);

  const filteredPositions = useMemo(() => {
    const search = positionSearch.trim();

    return activePositions.filter((position) => {
      const matchesSearch = !search || [
        position.title,
        position.positionCode,
        position.orgUnit?.name ?? '',
        position.classification?.title ?? '',
        position.incumbents.map((incumbent) => incumbent.fullName).join(' '),
      ].some((value) => matchesText(value, search));

      const matchesOrgUnit = !positionOrgUnitFilter || position.orgUnit?.id === positionOrgUnitFilter;
      const matchesClassification = !positionClassificationFilter || position.classification?.id === positionClassificationFilter;
      const matchesVacancy = vacancyFilter === 'All'
        || (vacancyFilter === 'Open seats' && position.vacancyCount > 0)
        || (vacancyFilter === 'Fully filled' && position.vacancyCount === 0);

      return matchesSearch && matchesOrgUnit && matchesClassification && matchesVacancy;
    });
  }, [activePositions, positionClassificationFilter, positionOrgUnitFilter, positionSearch, vacancyFilter]);

  const filteredClassificationCards = useMemo(() => {
    const search = classificationSearch.trim();

    return activeClassifications
      .filter((classification) => {
        if (!search) {
          return true;
        }

        return [
          classification.code,
          classification.title,
          classification.occupationCode,
          classification.family ?? '',
          classification.description ?? '',
        ].some((value) => matchesText(value, search));
      })
      .map((classification) => ({
        ...classification,
        levels: activeLevels.filter((level) => level.classificationId === classification.id),
      }));
  }, [activeClassifications, activeLevels, classificationSearch]);

  const filteredArchived = useMemo(() => {
    const search = archivedSearch.trim();
    const match = (value: string) => !search || matchesText(value, search);

    return {
      orgUnits: archivedOrgUnits.filter((unit) => match(`${unit.code} ${unit.name} ${unit.type}`)),
      positions: archivedPositions.filter((position) => match(`${position.positionCode} ${position.title} ${position.orgUnit?.name ?? ''}`)),
      classifications: archivedClassifications.filter((classification) => match(`${classification.code} ${classification.title} ${classification.occupationCode} ${classification.family ?? ''}`)),
      levels: archivedLevels.filter((level) => match(`${level.levelCode} ${level.classification?.title ?? ''} ${level.classification?.code ?? ''}`)),
    };
  }, [archivedClassifications, archivedLevels, archivedOrgUnits, archivedPositions, archivedSearch]);

  const resetNotice = () => setNotice(null);

  const openOrgUnitCreate = (parentId = '') => {
    setOrgUnitForm({ ...emptyOrgUnitForm, parentId });
    setPanel({ kind: 'orgUnitForm', mode: 'create' });
    resetNotice();
  };

  const openOrgUnitEdit = (unit: OrgUnitRecord) => {
    setOrgUnitForm({
      code: unit.code,
      name: unit.name,
      type: unit.type,
      parentId: unit.parentId ?? '',
    });
    setPanel({ kind: 'orgUnitForm', mode: 'edit', orgUnitId: unit.id });
    resetNotice();
  };

  const openPositionCreate = (defaults?: Partial<PositionFormState>) => {
    setPositionForm({
      ...emptyPositionForm,
      orgUnitId: defaults?.orgUnitId ?? '',
      classificationId: defaults?.classificationId ?? '',
      levelId: defaults?.levelId ?? '',
      reportsToPositionId: defaults?.reportsToPositionId ?? '',
      headcount: defaults?.headcount ?? '1',
      positionStatus: defaults?.positionStatus ?? 'Active',
      incumbentEmployeeIds: defaults?.incumbentEmployeeIds ?? [],
    });
    setPanel({ kind: 'positionForm', mode: 'create' });
    resetNotice();
  };

  const openPositionEdit = (position: PositionRecord) => {
    setPositionForm({
      positionCode: position.positionCode,
      title: position.title,
      orgUnitId: position.orgUnit?.id ?? '',
      classificationId: position.classification?.id ?? '',
      levelId: position.level?.id ?? '',
      reportsToPositionId: position.reportsToPosition?.id ?? '',
      headcount: String(position.headcount),
      positionStatus: position.positionStatus,
      incumbentEmployeeIds: position.incumbents.map((incumbent) => incumbent.id),
    });
    setPanel({ kind: 'positionForm', mode: 'edit', positionId: position.id });
    resetNotice();
  };

  const openClassificationCreate = () => {
    setClassificationForm(emptyClassificationForm);
    setPanel({ kind: 'classificationForm', mode: 'create' });
    resetNotice();
  };

  const openClassificationEdit = (classification: ClassificationRecord) => {
    setClassificationForm({
      code: classification.code,
      title: classification.title,
      occupationCode: classification.occupationCode,
      annualHours: String(classification.annualHours),
      family: classification.family ?? '',
      description: classification.description ?? '',
    });
    setPanel({ kind: 'classificationForm', mode: 'edit', classificationId: classification.id });
    resetNotice();
  };

  const openLevelCreate = (classificationId = '') => {
    setLevelForm({ ...emptyLevelForm, classificationId });
    setPanel({ kind: 'levelForm', mode: 'create' });
    resetNotice();
  };

  const openLevelEdit = (level: LevelRecord) => {
    setLevelForm({
      classificationId: level.classificationId,
      levelCode: level.levelCode,
      currency: level.currency,
      rangeMin: String(level.rangeMin),
      rangeMid: String(level.rangeMid),
      rangeMax: String(level.rangeMax),
    });
    setPanel({ kind: 'levelForm', mode: 'edit', levelId: level.id });
    resetNotice();
  };

  const openPositionInspector = (positionId: string) => {
    setPanel({ kind: 'inspectPosition', positionId });
    resetNotice();
  };

  const openArchiveDialog = (archive: ArchiveState) => {
    setArchiveState(archive);
    setArchiveReason('');
    resetNotice();
  };

  const closePanel = () => setPanel(null);

  const setSuccess = (message: string) => setNotice({ tone: 'success', message });
  const setFailure = (error: unknown, fallback: string) => {
    setNotice({ tone: 'error', message: error instanceof Error ? error.message : fallback });
  };

  const onPositionClassificationChange = (classificationId: string) => {
    setPositionForm((current) => ({
      ...current,
      classificationId,
      levelId: activeLevels.some((level) => level.id === current.levelId && level.classificationId === classificationId) ? current.levelId : '',
    }));
  };

  const submitOrgUnit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (panel?.kind !== 'orgUnitForm') {
      return;
    }

    const payload: OrgUnitPayload = {
      code: orgUnitForm.code.trim(),
      name: orgUnitForm.name.trim(),
      type: orgUnitForm.type.trim(),
      parentId: orgUnitForm.parentId || null,
    };

    if (!payload.name || !payload.type || (panel.mode === 'create' && !payload.code)) {
      setNotice({ tone: 'error', message: 'Code, name, and type are required for org units.' });
      return;
    }

    setSaving(true);

    try {
      if (panel.mode === 'create') {
        await createOrgUnit(payload);
        setSuccess('Org unit created.');
      } else if (panel.orgUnitId) {
        await updateOrgUnit(panel.orgUnitId, payload);
        setSuccess('Org unit updated.');
      }

      closePanel();
      await loadWorkspace();
    } catch (error) {
      setFailure(error, 'Unable to save org unit.');
    } finally {
      setSaving(false);
    }
  };

  const submitPosition = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (panel?.kind !== 'positionForm') {
      return;
    }

    const headcount = Number(positionForm.headcount);
    const payload: PositionPayload = {
      positionCode: positionForm.positionCode.trim(),
      title: positionForm.title.trim(),
      orgUnitId: positionForm.orgUnitId,
      classificationId: positionForm.classificationId,
      levelId: positionForm.levelId,
      reportsToPositionId: positionForm.reportsToPositionId || null,
      headcount,
      positionStatus: positionForm.positionStatus,
      incumbentEmployeeIds: positionForm.incumbentEmployeeIds,
    };

    if (!payload.title || !payload.orgUnitId || !payload.classificationId || !payload.levelId || Number.isNaN(headcount) || headcount < 1) {
      setNotice({ tone: 'error', message: 'Complete the title, org unit, classification, level, and headcount fields.' });
      return;
    }

    if (panel.mode === 'create' && !payload.positionCode) {
      setNotice({ tone: 'error', message: 'Position code is required when creating a position.' });
      return;
    }

    if (payload.incumbentEmployeeIds.length > headcount) {
      setNotice({ tone: 'error', message: 'Assigned incumbents exceed the approved headcount.' });
      return;
    }

    setSaving(true);

    try {
      if (panel.mode === 'create') {
        await createPosition(payload);
        setSuccess('Position created.');
      } else if (panel.positionId) {
        await updatePosition(panel.positionId, payload);
        setSuccess('Position updated.');
      }

      closePanel();
      await loadWorkspace();
    } catch (error) {
      setFailure(error, 'Unable to save position.');
    } finally {
      setSaving(false);
    }
  };

  const submitClassification = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (panel?.kind !== 'classificationForm') {
      return;
    }

    const annualHours = Number(classificationForm.annualHours);
    const payload: ClassificationPayload = {
      code: classificationForm.code.trim(),
      title: classificationForm.title.trim(),
      occupationCode: classificationForm.occupationCode.trim().toUpperCase(),
      annualHours,
      family: classificationForm.family.trim() || null,
      description: classificationForm.description.trim() || null,
    };

    if (!payload.title || !payload.occupationCode || (panel.mode === 'create' && !payload.code)) {
      setNotice({ tone: 'error', message: 'Code, title, and occupation code are required for classifications.' });
      return;
    }

    if (Number.isNaN(annualHours) || !Number.isInteger(annualHours) || annualHours < 1) {
      setNotice({ tone: 'error', message: 'Annual hours must be a whole number greater than zero.' });
      return;
    }

    setSaving(true);

    try {
      if (panel.mode === 'create') {
        await createClassification(payload);
        setSuccess('Classification created.');
      } else if (panel.classificationId) {
        await updateClassification(panel.classificationId, payload);
        setSuccess('Classification updated.');
      }

      closePanel();
      await loadWorkspace();
    } catch (error) {
      setFailure(error, 'Unable to save classification.');
    } finally {
      setSaving(false);
    }
  };

  const submitLevel = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (panel?.kind !== 'levelForm') {
      return;
    }

    const payload: LevelPayload = {
      classificationId: levelForm.classificationId,
      levelCode: levelForm.levelCode.trim(),
      currency: levelForm.currency.trim(),
      rangeMin: Number(levelForm.rangeMin),
      rangeMid: Number(levelForm.rangeMid),
      rangeMax: Number(levelForm.rangeMax),
    };

    if (!payload.classificationId || !payload.currency || Number.isNaN(payload.rangeMin) || Number.isNaN(payload.rangeMid) || Number.isNaN(payload.rangeMax)) {
      setNotice({ tone: 'error', message: 'Classification, currency, and all range values are required.' });
      return;
    }

    if (panel.mode === 'create' && !payload.levelCode) {
      setNotice({ tone: 'error', message: 'Level code is required when creating a classification level.' });
      return;
    }

    if (payload.rangeMin > payload.rangeMid || payload.rangeMid > payload.rangeMax) {
      setNotice({ tone: 'error', message: 'Range values must follow start <= midpoint <= top of range.' });
      return;
    }

    setSaving(true);

    try {
      if (panel.mode === 'create') {
        await createLevel(payload as LevelPayload & { classificationId: string; levelCode: string });
        setSuccess('Classification level created.');
      } else if (panel.levelId) {
        await updateLevel(panel.levelId, payload);
        setSuccess('Classification level updated.');
      }

      closePanel();
      await loadWorkspace();
    } catch (error) {
      setFailure(error, 'Unable to save classification level.');
    } finally {
      setSaving(false);
    }
  };

  const submitArchive = async () => {
    if (!archiveState) {
      return;
    }

    setSaving(true);

    try {
      if (archiveState.entity === 'orgUnit') {
        await archiveOrgUnit(archiveState.id, { archiveReason: archiveReason.trim() || null });
      } else if (archiveState.entity === 'position') {
        await archivePosition(archiveState.id, { archiveReason: archiveReason.trim() || null });
      } else if (archiveState.entity === 'classification') {
        await archiveClassification(archiveState.id, { archiveReason: archiveReason.trim() || null });
      } else {
        await archiveLevel(archiveState.id, { archiveReason: archiveReason.trim() || null });
      }

      setArchiveState(null);
      setArchiveReason('');
      closePanel();
      setSuccess(`${archiveState.label} archived.`);
      await loadWorkspace();
    } catch (error) {
      setFailure(error, `Unable to archive ${archiveState.label.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  };

  const restoreRecord = async (entity: ArchiveEntity, id: string, label: string) => {
    const actionKey = `${entity}:${id}`;
    setActiveActionKey(actionKey);

    try {
      if (entity === 'orgUnit') {
        await restoreOrgUnit(id);
      } else if (entity === 'position') {
        await restorePosition(id);
      } else if (entity === 'classification') {
        await restoreClassification(id);
      } else {
        await restoreLevel(id);
      }

      setSuccess(`${label} restored.`);
      await loadWorkspace();
    } catch (error) {
      setFailure(error, `Unable to restore ${label.toLowerCase()}.`);
    } finally {
      setActiveActionKey(null);
    }
  };

  if (loading && !snapshot) {
    return (
      <section className="organization-page">
        <div className="card organization-state">
          <LoaderCircle className="organization-spin" size={18} />
          <span>Loading organization workspace...</span>
        </div>
      </section>
    );
  }

  if (loadError && !snapshot) {
    return (
      <section className="organization-page">
        <div className="card organization-state organization-state-error">
          <ShieldAlert size={18} />
          <span>{loadError}</span>
          <button type="button" className="button" onClick={() => { void loadWorkspace(); }}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  const metrics = snapshot?.metrics ?? {
    orgUnitCount: activeOrgUnits.length,
    positionCount: activePositions.length,
    filledPositionCount: activePositions.filter((position) => position.incumbents.length > 0).length,
    openSeatCount: activePositions.reduce((total, position) => total + position.vacancyCount, 0),
    classificationCount: activeClassifications.length,
  };

  return (
    <section className="organization-page">
      <div className="organization-hero card">
        <div className="page-header organization-page-header">
          <div>
            <span className="organization-eyebrow">Organization Management</span>
            <h1 className="page-title">Org Design and Position Control</h1>
            <p className="page-subtitle">Manage org units, approved positions, classification architecture, and reversible archive actions from one workspace.</p>
          </div>
          <button
            type="button"
            className="button organization-primary-action"
            onClick={() => {
              if (tab === 'orgUnits') {
                openOrgUnitCreate();
              } else if (tab === 'classifications') {
                openClassificationCreate();
              } else {
                openPositionCreate();
              }
            }}
          >
            <Plus size={16} />
            {tab === 'orgUnits' ? 'New org unit' : tab === 'classifications' ? 'New classification' : 'New position'}
          </button>
        </div>

        <div className="organization-metric-grid">
          <MetricCard icon={<Building2 size={18} />} label="Org units" value={String(metrics.orgUnitCount)} />
          <MetricCard icon={<Waypoints size={18} />} label="Approved positions" value={String(metrics.positionCount)} />
          <MetricCard icon={<UsersRound size={18} />} label="Filled positions" value={String(metrics.filledPositionCount)} />
          <MetricCard icon={<GitBranch size={18} />} label="Open seats" value={String(metrics.openSeatCount)} />
          <MetricCard icon={<Layers3 size={18} />} label="Classifications" value={String(metrics.classificationCount)} />
        </div>

        <div className="organization-tab-row" role="tablist" aria-label="Organization workspace sections">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`organization-tab ${tab === item.id ? 'organization-tab-active' : ''}`}
              onClick={() => setTab(item.id)}
              aria-pressed={tab === item.id}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {notice ? (
        <div className={`organization-banner organization-banner-${notice.tone}`}>
          {notice.tone === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{notice.message}</span>
          <button type="button" className="organization-banner-close" onClick={() => setNotice(null)}>
            <X size={16} />
          </button>
        </div>
      ) : null}

      {loadError && snapshot ? (
        <div className="organization-banner organization-banner-error">
          <AlertTriangle size={16} />
          <span>{loadError}</span>
        </div>
      ) : null}

      {tab === 'overview' ? (
        <>
          <div className="card organization-view-card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Org design view</h2>
                <p className="card-subtitle">Browse the active structure as a traditional chart or as org-unit structure. Chart nodes open a quick-action detail drawer.</p>
              </div>
              <div className="organization-toggle" role="tablist" aria-label="Org design view mode">
                <button type="button" className={`organization-toggle-button ${structureView === 'chart' ? 'organization-toggle-button-active' : ''}`} onClick={() => setStructureView('chart')}>Org chart</button>
                <button type="button" className={`organization-toggle-button ${structureView === 'structure' ? 'organization-toggle-button-active' : ''}`} onClick={() => setStructureView('structure')}>Structure</button>
              </div>
            </div>

            {structureView === 'chart' ? (
              <div className="organization-chart-shell">
                <ul className="organization-chart-level organization-chart-root">
                  {chartRoots.map((node) => (
                    <ChartNode key={node.position.id} node={node} onSelect={(positionId) => openPositionInspector(positionId)} />
                  ))}
                </ul>
              </div>
            ) : (
              <div className="organization-structure-shell">
                {(snapshot?.orgUnits ?? []).map((node) => (
                  <OverviewStructureNode key={node.id} node={node} onAddChild={(parentId) => openOrgUnitCreate(parentId)} onSelectPosition={(positionId) => openPositionInspector(positionId)} />
                ))}
              </div>
            )}
          </div>

          <div className="organization-two-column">
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Management model</h2>
                  <p className="card-subtitle">Keep structure objects stable and manage people as incumbents of positions.</p>
                </div>
              </div>
              <div className="organization-guidance-list">
                <GuidanceItem title="Org units" body="Structural containers for divisions, departments, and teams." />
                <GuidanceItem title="Positions" body="Approved seats with headcount, reporting lines, and vacancy tracking." />
                <GuidanceItem title="Classifications" body="Reusable job architecture with levels and pay ranges." />
                <GuidanceItem title="Archive controls" body="Soft-delete with guards and restore, never destructive removal." />
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Current coverage</h2>
                  <p className="card-subtitle">A compact snapshot of the active architecture in the system.</p>
                </div>
              </div>
              <div className="organization-summary-stack">
                <SummaryRow label="Org units with active positions" value={String(activeOrgUnits.filter((unit) => unit.activePositionCount > 0).length)} />
                <SummaryRow label="Vacant or partially vacant positions" value={String(activePositions.filter((position) => position.vacancyCount > 0).length)} />
                <SummaryRow label="Active classification levels" value={String(activeLevels.length)} />
                <SummaryRow label="Archived records pending review" value={String(archivedOrgUnits.length + archivedPositions.length + archivedClassifications.length + archivedLevels.length)} />
              </div>
            </div>
          </div>
        </>
      ) : null}

      {tab === 'orgUnits' ? (
        <div className="card">
          <div className="organization-toolbar">
            <label className="organization-search">
              <Search size={16} />
              <input type="search" value={orgUnitSearch} onChange={(event) => setOrgUnitSearch(event.target.value)} placeholder="Search org units by code, name, or type" />
            </label>
            <button type="button" className="button button-outline" onClick={() => openOrgUnitCreate()}>
              <Plus size={16} />
              Add org unit
            </button>
          </div>
          <div className="organization-list">
            {filteredOrgUnitRows.length === 0 ? (
              <EmptyState icon={<Building2 size={20} />} message="No org units matched the current filter." />
            ) : filteredOrgUnitRows.map(({ unit, depth }) => (
              <article key={unit.id} className="organization-list-card" style={{ ['--organization-depth' as string]: depth } as React.CSSProperties}>
                <div className="organization-list-main">
                  <div>
                    <div className="organization-list-title">{unit.name}</div>
                    <div className="organization-list-meta">{unit.code} · {unit.type}</div>
                  </div>
                  <div className="organization-stat-pills">
                    <span>{unit.activePositionCount} positions</span>
                    <span>{unit.incumbentCount} incumbents</span>
                    <span>{unit.activeChildCount} child units</span>
                  </div>
                </div>
                <div className="organization-list-actions">
                  <button type="button" className="button button-outline" onClick={() => openOrgUnitCreate(unit.id)}>
                    <Plus size={16} />
                    Child unit
                  </button>
                  <button type="button" className="button button-outline" onClick={() => openOrgUnitEdit(unit)}>
                    <PencilLine size={16} />
                    Edit
                  </button>
                  <button type="button" className="button organization-danger-outline" onClick={() => openArchiveDialog({ entity: 'orgUnit', id: unit.id, label: 'Org unit', title: unit.name, subtitle: `${unit.code} · ${unit.type}` })}>
                    <Archive size={16} />
                    Archive
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'positions' ? (
        <div className="card">
          <div className="organization-toolbar organization-toolbar-grid">
            <label className="organization-search">
              <Search size={16} />
              <input type="search" value={positionSearch} onChange={(event) => setPositionSearch(event.target.value)} placeholder="Search positions, codes, org units, or incumbents" />
            </label>
            <select value={positionOrgUnitFilter} onChange={(event) => setPositionOrgUnitFilter(event.target.value)}>
              <option value="">All org units</option>
              {activeOrgUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
            <select value={positionClassificationFilter} onChange={(event) => setPositionClassificationFilter(event.target.value)}>
              <option value="">All classifications</option>
              {activeClassifications.map((classification) => <option key={classification.id} value={classification.id}>{classification.title}</option>)}
            </select>
            <select value={vacancyFilter} onChange={(event) => setVacancyFilter(event.target.value as VacancyFilter)}>
              <option>All</option>
              <option>Open seats</option>
              <option>Fully filled</option>
            </select>
          </div>

          <div className="organization-table-shell">
            <table className="data-table organization-table">
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Org unit</th>
                  <th>Classification</th>
                  <th>Occupancy</th>
                  <th>Reports to</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredPositions.map((position) => (
                  <tr key={position.id}>
                    <td>
                      <div className="organization-cell-title">{position.title}</div>
                      <div className="organization-cell-meta">{position.positionCode}</div>
                    </td>
                    <td>{position.orgUnit?.name ?? 'Unassigned'}</td>
                    <td>{position.classification?.title ?? 'Unassigned'} · L{position.level?.levelCode ?? '-'}</td>
                    <td><span className={`badge ${getPositionTone(position)}`}>{position.incumbents.length}/{position.headcount} filled</span></td>
                    <td>{position.reportsToPosition?.title ?? 'Top of chart'}</td>
                    <td>
                      <div className="organization-row-actions">
                        <button type="button" className="organization-icon-button" onClick={() => openPositionInspector(position.id)} title="Inspect position"><ArrowRight size={16} /></button>
                        <button type="button" className="organization-icon-button" onClick={() => openPositionEdit(position)} title="Edit position"><PencilLine size={16} /></button>
                        <button type="button" className="organization-icon-button organization-icon-button-danger" onClick={() => openArchiveDialog({ entity: 'position', id: position.id, label: 'Position', title: position.title, subtitle: position.positionCode })} title="Archive position"><Archive size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="organization-mobile-stack">
            {filteredPositions.map((position) => (
              <article key={position.id} className="organization-mobile-card">
                <div className="organization-mobile-card-header">
                  <div>
                    <div className="organization-cell-title">{position.title}</div>
                    <div className="organization-cell-meta">{position.positionCode}</div>
                  </div>
                  <span className={`badge ${getPositionTone(position)}`}>{position.incumbents.length}/{position.headcount}</span>
                </div>
                <div className="organization-mobile-grid">
                  <MobileDatum label="Org unit" value={position.orgUnit?.name ?? 'Unassigned'} />
                  <MobileDatum label="Classification" value={`${position.classification?.title ?? 'Unassigned'} · L${position.level?.levelCode ?? '-'}`} />
                  <MobileDatum label="Reports to" value={position.reportsToPosition?.title ?? 'Top of chart'} />
                  <MobileDatum label="Incumbents" value={position.incumbents.length > 0 ? position.incumbents.map((incumbent) => incumbent.fullName).join(', ') : 'Vacant'} />
                </div>
                <div className="organization-list-actions">
                  <button type="button" className="button button-outline" onClick={() => openPositionInspector(position.id)}><ArrowRight size={16} />View</button>
                  <button type="button" className="button button-outline" onClick={() => openPositionEdit(position)}><PencilLine size={16} />Edit</button>
                  <button type="button" className="button organization-danger-outline" onClick={() => openArchiveDialog({ entity: 'position', id: position.id, label: 'Position', title: position.title, subtitle: position.positionCode })}><Archive size={16} />Archive</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'classifications' ? (
        <div className="card">
          <div className="organization-toolbar">
            <label className="organization-search">
              <Search size={16} />
              <input type="search" value={classificationSearch} onChange={(event) => setClassificationSearch(event.target.value)} placeholder="Search classifications by code, title, occupation code, family, or description" />
            </label>
            <div className="organization-list-actions">
              <button type="button" className="button button-outline" onClick={() => openLevelCreate()}>
                <Plus size={16} />
                New level
              </button>
              <button type="button" className="button" onClick={openClassificationCreate}>
                <Plus size={16} />
                New classification
              </button>
            </div>
          </div>

          <div className="organization-classification-stack">
            {filteredClassificationCards.length === 0 ? (
              <EmptyState icon={<Layers3 size={20} />} message="No classifications matched the current filter." />
            ) : filteredClassificationCards.map((classification) => (
              <article key={classification.id} className="organization-classification-card">
                <div className="organization-classification-top">
                  <div>
                    <div className="organization-classification-title">{classification.title}</div>
                    <div className="organization-stat-pills organization-classification-pills">
                      <span>Occupation {classification.occupationCode}</span>
                      <span>{formatAnnualHours(classification.annualHours)} hrs / year</span>
                      <span>{classification.activePositionCount} active positions</span>
                    </div>
                    <div className="organization-cell-meta">{classification.code} · {classification.family ?? 'Shared family'}</div>
                    {classification.description ? <p className="organization-classification-description">{classification.description}</p> : null}
                  </div>
                  <div className="organization-list-actions">
                    <button type="button" className="button button-outline" onClick={() => openLevelCreate(classification.id)}>
                      <Plus size={16} />
                      Add level
                    </button>
                    <button type="button" className="button button-outline" onClick={() => openClassificationEdit(classification)}>
                      <PencilLine size={16} />
                      Edit
                    </button>
                    <button type="button" className="button organization-danger-outline" onClick={() => openArchiveDialog({ entity: 'classification', id: classification.id, label: 'Classification', title: classification.title, subtitle: classification.code })}>
                      <Archive size={16} />
                      Archive
                    </button>
                  </div>
                </div>
                <div className="organization-band-table">
                  <div className="organization-band-row organization-band-head">
                    <span>Level</span>
                    <span>Hourly start</span>
                    <span>Hourly midpoint</span>
                    <span>Hourly top</span>
                    <span>Actions</span>
                  </div>
                  {classification.levels.length === 0 ? (
                    <div className="organization-band-empty">No active levels. Add a level before assigning positions.</div>
                  ) : classification.levels.map((level) => (
                    <div key={level.id} className="organization-band-row">
                      <strong>{level.levelCode}</strong>
                      <span>{formatHourlyRate(level.rangeMin, level.currency)}</span>
                      <span>{formatHourlyRate(level.rangeMid, level.currency)}</span>
                      <span>{formatHourlyRate(level.rangeMax, level.currency)}</span>
                      <div className="organization-row-actions">
                        <button type="button" className="organization-icon-button" onClick={() => openLevelEdit(activeLevels.find((candidate) => candidate.id === level.id) ?? { ...level, classification: { id: classification.id, code: classification.code, title: classification.title, occupationCode: classification.occupationCode, annualHours: classification.annualHours, recordStatus: 'Active' } })}><PencilLine size={16} /></button>
                        <button type="button" className="organization-icon-button organization-icon-button-danger" onClick={() => openArchiveDialog({ entity: 'level', id: level.id, label: 'Level', title: `${classification.title} L${level.levelCode}`, subtitle: `${level.currency} ranges` })}><Archive size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'archived' ? (
        <div className="organization-archived-layout">
          <div className="card">
            <div className="organization-toolbar">
              <label className="organization-search">
                <Search size={16} />
                <input type="search" value={archivedSearch} onChange={(event) => setArchivedSearch(event.target.value)} placeholder="Search archived records" />
              </label>
            </div>
            <ArchivedSection title="Org units" records={filteredArchived.orgUnits.map((unit) => ({
              id: unit.id,
              title: unit.name,
              subtitle: `${unit.code} · ${unit.type}`,
              detail: unit.archiveReason ?? 'No archive reason recorded.',
              actionLabel: 'Restore org unit',
              actionKey: `orgUnit:${unit.id}`,
              onAction: () => { void restoreRecord('orgUnit', unit.id, 'Org unit'); },
              busy: activeActionKey === `orgUnit:${unit.id}`,
            }))} />
            <ArchivedSection title="Positions" records={filteredArchived.positions.map((position) => ({
              id: position.id,
              title: position.title,
              subtitle: position.positionCode,
              detail: position.archiveReason ?? 'No archive reason recorded.',
              actionLabel: 'Restore position',
              actionKey: `position:${position.id}`,
              onAction: () => { void restoreRecord('position', position.id, 'Position'); },
              busy: activeActionKey === `position:${position.id}`,
            }))} />
            <ArchivedSection title="Classifications" records={filteredArchived.classifications.map((classification) => ({
              id: classification.id,
              title: classification.title,
              subtitle: `${classification.code} | ${classification.occupationCode}`,
              detail: classification.archiveReason ?? 'No archive reason recorded.',
              actionLabel: 'Restore classification',
              actionKey: `classification:${classification.id}`,
              onAction: () => { void restoreRecord('classification', classification.id, 'Classification'); },
              busy: activeActionKey === `classification:${classification.id}`,
            }))} />
            <ArchivedSection title="Levels" records={filteredArchived.levels.map((level) => ({
              id: level.id,
              title: `${level.classification?.title ?? 'Classification'} L${level.levelCode}`,
              subtitle: level.classification?.code ?? 'Unassigned classification',
              detail: level.archiveReason ?? 'No archive reason recorded.',
              actionLabel: 'Restore level',
              actionKey: `level:${level.id}`,
              onAction: () => { void restoreRecord('level', level.id, 'Level'); },
              busy: activeActionKey === `level:${level.id}`,
            }))} />
          </div>
        </div>
      ) : null}

      <div className={`organization-panel-overlay ${panel ? 'organization-panel-overlay-visible' : ''}`} onClick={closePanel} />
      <aside className={`organization-panel ${panel ? 'organization-panel-open' : ''}`}>
        {panel?.kind === 'inspectPosition' && selectedPosition ? (
          <div className="organization-panel-content">
            <div className="organization-panel-header">
              <div>
                <h2>{selectedPosition.title}</h2>
                <p>{selectedPosition.positionCode} · {selectedPosition.orgUnit?.name ?? 'Unassigned org unit'}</p>
              </div>
              <button type="button" className="organization-icon-button" onClick={closePanel}><X size={18} /></button>
            </div>
            <div className="organization-inspector-grid">
              <InspectorDatum label="Classification" value={`${selectedPosition.classification?.title ?? 'Unassigned'} · L${selectedPosition.level?.levelCode ?? '-'}`} />
              <InspectorDatum label="Occupancy" value={`${selectedPosition.incumbents.length} of ${selectedPosition.headcount} filled`} />
              <InspectorDatum label="Reports to" value={selectedPosition.reportsToPosition?.title ?? 'Top of chart'} />
              <InspectorDatum label="Status" value={selectedPosition.positionStatus} />
            </div>
            <div className="organization-list-actions organization-panel-actions">
              <button type="button" className="button" onClick={() => openPositionCreate({ orgUnitId: selectedPosition.orgUnit?.id ?? '', reportsToPositionId: selectedPosition.id })}><Plus size={16} />Add child position</button>
              <button type="button" className="button button-outline" onClick={() => openPositionEdit(selectedPosition)}><PencilLine size={16} />Edit</button>
              <button type="button" className="button organization-danger-outline" onClick={() => openArchiveDialog({ entity: 'position', id: selectedPosition.id, label: 'Position', title: selectedPosition.title, subtitle: selectedPosition.positionCode })}><Archive size={16} />Archive</button>
            </div>
            <div className="organization-panel-section">
              <h3>Incumbents</h3>
              {selectedPosition.incumbents.length === 0 ? <p className="organization-muted-copy">This position is currently vacant.</p> : (
                <div className="organization-incumbent-stack">
                  {selectedPosition.incumbents.map((incumbent) => (
                    <div key={incumbent.id} className="organization-incumbent-card">
                      <strong>{incumbent.fullName}</strong>
                      <span>{incumbent.employeeNumber} · {incumbent.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {panel?.kind === 'orgUnitForm' ? <OrgUnitFormPanel panel={panel} form={orgUnitForm} orgUnits={activeOrgUnits} saving={saving} onClose={closePanel} onChange={setOrgUnitForm} onSubmit={submitOrgUnit} /> : null}
        {panel?.kind === 'positionForm' ? <PositionFormPanel panel={panel} form={positionForm} orgUnits={activeOrgUnits} classifications={activeClassifications} levels={availableLevels} positions={positionOptions} employees={employeeOptions} saving={saving} onClose={closePanel} onClassificationChange={onPositionClassificationChange} onChange={setPositionForm} onSubmit={submitPosition} /> : null}
        {panel?.kind === 'classificationForm' ? <ClassificationFormPanel panel={panel} form={classificationForm} saving={saving} onClose={closePanel} onChange={setClassificationForm} onSubmit={submitClassification} /> : null}
        {panel?.kind === 'levelForm' ? <LevelFormPanel panel={panel} form={levelForm} classifications={activeClassifications} saving={saving} onClose={closePanel} onChange={setLevelForm} onSubmit={submitLevel} /> : null}
      </aside>

      {archiveState ? (
        <div className="organization-dialog-backdrop">
          <div className="organization-dialog card">
            <div className="organization-dialog-icon"><AlertTriangle size={20} /></div>
            <h2>Archive {archiveState.label.toLowerCase()}</h2>
            <p>{archiveState.title}</p>
            <span className="organization-dialog-subtitle">{archiveState.subtitle}</span>
            <label className="organization-field">
              <span>Archive reason</span>
              <textarea value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} rows={3} placeholder="Optional note for future restore decisions" />
            </label>
            <div className="organization-dialog-actions">
              <button type="button" className="button button-outline" onClick={() => setArchiveState(null)}>Cancel</button>
              <button type="button" className="button organization-danger-button" onClick={() => { void submitArchive(); }} disabled={saving}>
                {saving ? <LoaderCircle className="organization-spin" size={16} /> : <Archive size={16} />}
                Confirm archive
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="organization-metric-card">
      <div className="organization-metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GuidanceItem({ title, body }: { title: string; body: string }) {
  return (
    <article className="organization-guidance-item">
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="organization-summary-row"><span>{label}</span><strong>{value}</strong></div>;
}

function EmptyState({ icon, message }: { icon: ReactNode; message: string }) {
  return <div className="organization-empty-state">{icon}<span>{message}</span></div>;
}

function MobileDatum({ label, value }: { label: string; value: string }) {
  return <div><span className="organization-mobile-label">{label}</span><strong>{value}</strong></div>;
}

function InspectorDatum({ label, value }: { label: string; value: string }) {
  return <div className="organization-inspector-datum"><span>{label}</span><strong>{value}</strong></div>;
}

function OverviewStructureNode({
  node,
  onAddChild,
  onSelectPosition,
}: {
  node: OrgUnitNode;
  onAddChild: (parentId: string) => void;
  onSelectPosition: (positionId: string) => void;
}) {
  return (
    <div className="organization-structure-node">
      <div className="organization-structure-card">
        <div className="organization-structure-header">
          <div>
            <h3>{node.name}</h3>
            <p>{node.code} · {node.type}</p>
          </div>
          <button type="button" className="button button-outline" onClick={() => onAddChild(node.id)}>
            <Plus size={16} />
            Add child
          </button>
        </div>
        <div className="organization-stat-pills">
          <span>{node.summary.approvedPositions} positions</span>
          <span>{node.summary.filledPositions} filled</span>
          <span>{node.summary.openSeats} open seats</span>
        </div>
        {node.positions.length > 0 ? (
          <div className="organization-position-chip-row">
            {node.positions.map((position) => (
              <button key={position.id} type="button" className="organization-position-chip" onClick={() => onSelectPosition(position.id)}>
                <strong>{position.title}</strong>
                <span>{position.positionCode}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {node.children.length > 0 ? (
        <div className="organization-structure-children">
          {node.children.map((child) => <OverviewStructureNode key={child.id} node={child} onAddChild={onAddChild} onSelectPosition={onSelectPosition} />)}
        </div>
      ) : null}
    </div>
  );
}

function ChartNode({ node, onSelect }: { node: PositionChartNode; onSelect: (positionId: string) => void }) {
  return (
    <li className="organization-chart-branch">
      <button type="button" className="organization-chart-card" onClick={() => onSelect(node.position.id)}>
        <div className="organization-chart-card-top">
          <span className={`badge ${getPositionTone(node.position)}`}>{node.position.vacancyCount > 0 ? 'Open seat' : 'Filled'}</span>
          <span className="organization-chart-card-code">{node.position.positionCode}</span>
        </div>
        <h3>{node.position.title}</h3>
        <p>{node.position.orgUnit?.name ?? 'Unassigned org unit'}</p>
        <span>{node.position.classification?.title ?? 'Unassigned'} · L{node.position.level?.levelCode ?? '-'}</span>
      </button>
      {node.children.length > 0 ? (
        <ul className="organization-chart-level">
          {node.children.map((child) => <ChartNode key={child.position.id} node={child} onSelect={onSelect} />)}
        </ul>
      ) : null}
    </li>
  );
}

function ArchivedSection({
  title,
  records,
}: {
  title: string;
  records: Array<{ id: string; title: string; subtitle: string; detail: string; actionLabel: string; actionKey: string; onAction: () => void; busy: boolean }>;
}) {
  return (
    <section className="organization-archived-section">
      <div className="organization-section-header">
        <h3>{title}</h3>
        <span>{records.length}</span>
      </div>
      {records.length === 0 ? (
        <div className="organization-archived-empty">No archived {title.toLowerCase()}.</div>
      ) : records.map((record) => (
        <article key={record.id} className="organization-archived-card">
          <div>
            <strong>{record.title}</strong>
            <p>{record.subtitle}</p>
            <small>{record.detail}</small>
          </div>
          <button type="button" className="button button-outline" onClick={record.onAction} disabled={record.busy}>
            {record.busy ? <LoaderCircle className="organization-spin" size={16} /> : <ArrowRight size={16} />}
            {record.actionLabel}
          </button>
        </article>
      ))}
    </section>
  );
}

function PanelFrame({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="organization-panel-content">
      <div className="organization-panel-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button type="button" className="organization-icon-button" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {children}
    </div>
  );
}

function OrgUnitFormPanel({
  panel,
  form,
  orgUnits,
  saving,
  onClose,
  onChange,
  onSubmit,
}: {
  panel: Extract<PanelState, { kind: 'orgUnitForm' }>;
  form: OrgUnitFormState;
  orgUnits: OrgUnitRecord[];
  saving: boolean;
  onClose: () => void;
  onChange: (value: OrgUnitFormState | ((current: OrgUnitFormState) => OrgUnitFormState)) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <PanelFrame title={panel.mode === 'create' ? 'Add org unit' : 'Edit org unit'} subtitle="Create or adjust structural containers without mixing them with employee records." onClose={onClose}>
      <form className="organization-form" onSubmit={onSubmit}>
        <Field label="Code"><input value={form.code} onChange={(event) => onChange({ ...form, code: event.target.value })} disabled={panel.mode === 'edit'} /></Field>
        <Field label="Name"><input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} /></Field>
        <Field label="Type"><input value={form.type} onChange={(event) => onChange({ ...form, type: event.target.value })} /></Field>
        <Field label="Parent org unit">
          <select value={form.parentId} onChange={(event) => onChange({ ...form, parentId: event.target.value })}>
            <option value="">No parent</option>
            {orgUnits.filter((unit) => unit.id !== panel.orgUnitId).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
        </Field>
        <div className="organization-form-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button" disabled={saving}>{saving ? <LoaderCircle className="organization-spin" size={16} /> : <CheckCircle2 size={16} />}{panel.mode === 'create' ? 'Create org unit' : 'Save changes'}</button>
        </div>
      </form>
    </PanelFrame>
  );
}

function PositionFormPanel({
  panel,
  form,
  orgUnits,
  classifications,
  levels,
  positions,
  employees,
  saving,
  onClose,
  onClassificationChange,
  onChange,
  onSubmit,
}: {
  panel: Extract<PanelState, { kind: 'positionForm' }>;
  form: PositionFormState;
  orgUnits: OrgUnitRecord[];
  classifications: ClassificationRecord[];
  levels: LevelRecord[];
  positions: PositionRecord[];
  employees: EmployeeOption[];
  saving: boolean;
  onClose: () => void;
  onClassificationChange: (classificationId: string) => void;
  onChange: (value: PositionFormState | ((current: PositionFormState) => PositionFormState)) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <PanelFrame title={panel.mode === 'create' ? 'Add position' : 'Edit position'} subtitle="Manage approved seats, reporting lines, and incumbent assignment from one drawer." onClose={onClose}>
      <form className="organization-form" onSubmit={onSubmit}>
        <Field label="Position code"><input value={form.positionCode} onChange={(event) => onChange({ ...form, positionCode: event.target.value })} disabled={panel.mode === 'edit'} /></Field>
        <Field label="Title"><input value={form.title} onChange={(event) => onChange({ ...form, title: event.target.value })} /></Field>
        <Field label="Org unit"><select value={form.orgUnitId} onChange={(event) => onChange({ ...form, orgUnitId: event.target.value })}><option value="">Select org unit</option>{orgUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field>
        <Field label="Classification"><select value={form.classificationId} onChange={(event) => onClassificationChange(event.target.value)}><option value="">Select classification</option>{classifications.map((classification) => <option key={classification.id} value={classification.id}>{`${classification.title} (${classification.occupationCode})`}</option>)}</select></Field>
        <Field label="Level"><select value={form.levelId} onChange={(event) => onChange({ ...form, levelId: event.target.value })}><option value="">Select level</option>{levels.map((level) => <option key={level.id} value={level.id}>L{level.levelCode}</option>)}</select></Field>
        <Field label="Reports to"><select value={form.reportsToPositionId} onChange={(event) => onChange({ ...form, reportsToPositionId: event.target.value })}><option value="">Top of chart</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}</select></Field>
        <Field label="Headcount"><input type="number" min="1" value={form.headcount} onChange={(event) => onChange({ ...form, headcount: event.target.value })} /></Field>
        <Field label="Position status"><select value={form.positionStatus} onChange={(event) => onChange({ ...form, positionStatus: event.target.value as PositionStatus })}><option value="Active">Active</option><option value="Vacant">Vacant</option><option value="On Hold">On Hold</option></select></Field>
        <div className="organization-form-section">
          <div className="organization-section-header">
            <h3>Incumbent assignment</h3>
            <span>{form.incumbentEmployeeIds.length} selected</span>
          </div>
          <div className="organization-checkbox-stack">
            {employees.map((employee) => {
              const checked = form.incumbentEmployeeIds.includes(employee.id);
              return (
                <label key={employee.id} className="organization-checkbox-row">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onChange((current) => ({
                      ...current,
                      incumbentEmployeeIds: event.target.checked
                        ? [...current.incumbentEmployeeIds, employee.id]
                        : current.incumbentEmployeeIds.filter((candidate) => candidate !== employee.id),
                    }))}
                  />
                  <span>
                    <strong>{employee.fullName}</strong>
                    <small>{employee.employeeNumber} · {employee.status}{employee.currentPosition ? ` · ${employee.currentPosition.title}` : ''}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="organization-form-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button" disabled={saving}>{saving ? <LoaderCircle className="organization-spin" size={16} /> : <CheckCircle2 size={16} />}{panel.mode === 'create' ? 'Create position' : 'Save changes'}</button>
        </div>
      </form>
    </PanelFrame>
  );
}

function ClassificationFormPanel({
  panel,
  form,
  saving,
  onClose,
  onChange,
  onSubmit,
}: {
  panel: Extract<PanelState, { kind: 'classificationForm' }>;
  form: ClassificationFormState;
  saving: boolean;
  onClose: () => void;
  onChange: (value: ClassificationFormState) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <PanelFrame title={panel.mode === 'create' ? 'Add classification' : 'Edit classification'} subtitle="Keep classification headers clean and move levels into a dedicated surface." onClose={onClose}>
      <form className="organization-form" onSubmit={onSubmit}>
        <Field label="Code"><input value={form.code} onChange={(event) => onChange({ ...form, code: event.target.value })} disabled={panel.mode === 'edit'} /></Field>
        <Field label="Title"><input value={form.title} onChange={(event) => onChange({ ...form, title: event.target.value })} /></Field>
        <Field label="Occupation code"><input value={form.occupationCode} onChange={(event) => onChange({ ...form, occupationCode: event.target.value.toUpperCase() })} maxLength={20} /></Field>
        <Field label="Annual hours"><input type="number" min="1" step="1" value={form.annualHours} onChange={(event) => onChange({ ...form, annualHours: event.target.value })} /></Field>
        <Field label="Family"><input value={form.family} onChange={(event) => onChange({ ...form, family: event.target.value })} /></Field>
        <Field label="Description"><textarea value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} rows={4} /></Field>
        <div className="organization-form-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button" disabled={saving}>{saving ? <LoaderCircle className="organization-spin" size={16} /> : <CheckCircle2 size={16} />}{panel.mode === 'create' ? 'Create classification' : 'Save changes'}</button>
        </div>
      </form>
    </PanelFrame>
  );
}

function LevelFormPanel({
  panel,
  form,
  classifications,
  saving,
  onClose,
  onChange,
  onSubmit,
}: {
  panel: Extract<PanelState, { kind: 'levelForm' }>;
  form: LevelFormState;
  classifications: ClassificationRecord[];
  saving: boolean;
  onClose: () => void;
  onChange: (value: LevelFormState) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <PanelFrame title={panel.mode === 'create' ? 'Add classification level' : 'Edit classification level'} subtitle="Maintain hourly start, midpoint, and top-of-range values without compressing the classification screen." onClose={onClose}>
      <form className="organization-form" onSubmit={onSubmit}>
        <Field label="Classification"><select value={form.classificationId} onChange={(event) => onChange({ ...form, classificationId: event.target.value })} disabled={panel.mode === 'edit'}><option value="">Select classification</option>{classifications.map((classification) => <option key={classification.id} value={classification.id}>{`${classification.title} (${classification.occupationCode})`}</option>)}</select></Field>
        <Field label="Level code"><input value={form.levelCode} onChange={(event) => onChange({ ...form, levelCode: event.target.value })} disabled={panel.mode === 'edit'} /></Field>
        <Field label="Currency"><input value={form.currency} onChange={(event) => onChange({ ...form, currency: event.target.value })} /></Field>
        <Field label="Hourly start"><input type="number" min="0" step="0.01" value={form.rangeMin} onChange={(event) => onChange({ ...form, rangeMin: event.target.value })} /></Field>
        <Field label="Hourly midpoint"><input type="number" min="0" step="0.01" value={form.rangeMid} onChange={(event) => onChange({ ...form, rangeMid: event.target.value })} /></Field>
        <Field label="Hourly top"><input type="number" min="0" step="0.01" value={form.rangeMax} onChange={(event) => onChange({ ...form, rangeMax: event.target.value })} /></Field>
        <div className="organization-form-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button" disabled={saving}>{saving ? <LoaderCircle className="organization-spin" size={16} /> : <CheckCircle2 size={16} />}{panel.mode === 'create' ? 'Create level' : 'Save changes'}</button>
        </div>
      </form>
    </PanelFrame>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="organization-field"><span>{label}</span>{children}</label>;
}
