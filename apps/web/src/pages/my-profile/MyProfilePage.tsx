import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BriefcaseBusiness,
  IdCard,
  LoaderCircle,
  PencilLine,
  Plus,
  RefreshCcw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  createMySkill,
  deleteMySkill,
  getMyProfile,
  listActiveSkillTaxonomy,
  listMySkills,
  updateMyProfile,
  updateMySkill,
  type MyProfileRecord,
  type MyProfileSkillRecord,
  type SkillCategoryRecord,
} from './my-profile.api';
import './MyProfilePage.css';

type MyProfileTab = 'personal' | 'employment' | 'skills';

interface PersonalFormState {
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
}

interface SkillFormState {
  skillTagId: string;
  selfReportedLevel: string;
  confidence: string;
}

const emptyPersonalForm: PersonalFormState = {
  email: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  province: '',
  postalCode: '',
  country: 'Canada',
  emergencyName: '',
  emergencyPhone: '',
  emergencyRelation: '',
};

const emptySkillForm: SkillFormState = {
  skillTagId: '',
  selfReportedLevel: '',
  confidence: '',
};

function toPersonalForm(profile: MyProfileRecord): PersonalFormState {
  return {
    email: profile.personalInfo.email,
    phone: profile.personalInfo.phone ?? '',
    addressLine1: profile.personalInfo.addressLine1 ?? '',
    addressLine2: profile.personalInfo.addressLine2 ?? '',
    city: profile.personalInfo.city ?? '',
    province: profile.personalInfo.province ?? '',
    postalCode: profile.personalInfo.postalCode ?? '',
    country: profile.personalInfo.country ?? 'Canada',
    emergencyName: profile.personalInfo.emergencyName ?? '',
    emergencyPhone: profile.personalInfo.emergencyPhone ?? '',
    emergencyRelation: profile.personalInfo.emergencyRelation ?? '',
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(value);
}

export function MyProfilePage() {
  const [profile, setProfile] = useState<MyProfileRecord | null>(null);
  const [skills, setSkills] = useState<MyProfileSkillRecord[]>([]);
  const [taxonomy, setTaxonomy] = useState<SkillCategoryRecord[]>([]);
  const [tab, setTab] = useState<MyProfileTab>('personal');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountLinked, setAccountLinked] = useState(true);
  const [personalForm, setPersonalForm] = useState<PersonalFormState>(emptyPersonalForm);
  const [skillForm, setSkillForm] = useState<SkillFormState>(emptySkillForm);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [profileResponse, mySkills, skillTaxonomy] = await Promise.all([
        getMyProfile(),
        listMySkills().catch(() => []),
        listActiveSkillTaxonomy(),
      ]);

      setAccountLinked(profileResponse.accountLinked);
      setProfile(profileResponse.profile);
      setSkills(mySkills);
      setTaxonomy(skillTaxonomy);

      if (profileResponse.profile) {
        setPersonalForm(toPersonalForm(profileResponse.profile));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const submitPersonalProfile = async () => {
    if (!profile) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updatedProfile = await updateMyProfile({
        email: personalForm.email.trim(),
        phone: personalForm.phone.trim() || null,
        addressLine1: personalForm.addressLine1.trim() || null,
        addressLine2: personalForm.addressLine2.trim() || null,
        city: personalForm.city.trim() || null,
        province: personalForm.province.trim() || null,
        postalCode: personalForm.postalCode.trim() || null,
        country: personalForm.country.trim() || 'Canada',
        emergencyName: personalForm.emergencyName.trim() || null,
        emergencyPhone: personalForm.emergencyPhone.trim() || null,
        emergencyRelation: personalForm.emergencyRelation.trim() || null,
      });

      setProfile(updatedProfile);
      setPersonalForm(toPersonalForm(updatedProfile));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update your profile.');
    } finally {
      setSaving(false);
    }
  };

  const submitSkill = async () => {
    if (!skillForm.skillTagId) {
      setError('Select a skill before saving.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        selfReportedLevel: skillForm.selfReportedLevel.trim() || null,
        confidence: skillForm.confidence ? Number(skillForm.confidence) : null,
      };

      const savedSkill = editingSkillId
        ? await updateMySkill(editingSkillId, payload)
        : await createMySkill({
          skillTagId: skillForm.skillTagId,
          ...payload,
        });

      setSkills((current) => {
        const filtered = current.filter((skill) => skill.id !== savedSkill.id);
        return [...filtered, savedSkill].sort((left, right) => left.skillTag.name.localeCompare(right.skillTag.name));
      });
      setEditingSkillId(null);
      setSkillForm(emptySkillForm);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save your skill.');
    } finally {
      setSaving(false);
    }
  };

  const beginEditSkill = (skill: MyProfileSkillRecord) => {
    setEditingSkillId(skill.id);
    setSkillForm({
      skillTagId: skill.skillTag.id,
      selfReportedLevel: skill.selfReportedLevel ?? '',
      confidence: skill.confidence ? String(skill.confidence) : '',
    });
  };

  const removeSkill = async (skillId: string) => {
    setSaving(true);
    setError(null);

    try {
      await deleteMySkill(skillId);
      setSkills((current) => current.filter((skill) => skill.id !== skillId));
      if (editingSkillId === skillId) {
        setEditingSkillId(null);
        setSkillForm(emptySkillForm);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to remove your skill.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="my-profile-page">
        <div className="card my-profile-state">
          <LoaderCircle className="my-profile-spin" size={18} />
          <span>Loading your profile...</span>
        </div>
      </div>
    );
  }

  if (!accountLinked || !profile) {
    return (
      <div className="my-profile-page">
        <div className="card my-profile-state">
          <AlertTriangle size={18} />
          <span>Your account is not linked to an employee profile yet.</span>
        </div>
      </div>
    );
  }

  return (
    <section className="my-profile-page">
      <div className="card my-profile-hero">
        <div className="page-header my-profile-header">
          <div>
            <span className="my-profile-eyebrow">My Work</span>
            <h1 className="page-title">My Profile</h1>
            <p className="page-subtitle">Maintain your personal contact details, review employment context, and keep your self-identified skills current.</p>
          </div>
          <button type="button" className="button button-outline" onClick={() => { void loadWorkspace(); }}>
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="my-profile-banner my-profile-banner-error">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="my-profile-summary-grid">
          <SummaryCard label="Employee" value={profile.employeeNumber} detail={profile.fullName} />
          <SummaryCard label="Department" value={profile.employmentInfo.department} detail={profile.employmentInfo.jobTitle} />
          <SummaryCard label="Manager" value={profile.employmentInfo.manager?.fullName ?? 'Not assigned'} detail={profile.employmentInfo.manager?.jobTitle ?? 'No manager on record'} />
          <SummaryCard label="Skills" value={String(skills.length)} detail="Self-identified skills on file" />
        </div>
      </div>

      <div className="card">
        <div className="my-profile-tab-list">
          <button type="button" className={`my-profile-tab ${tab === 'personal' ? 'my-profile-tab-active' : ''}`} onClick={() => setTab('personal')}>
            <IdCard size={14} />
            Personal Info
          </button>
          <button type="button" className={`my-profile-tab ${tab === 'employment' ? 'my-profile-tab-active' : ''}`} onClick={() => setTab('employment')}>
            <BriefcaseBusiness size={14} />
            Employment Info
          </button>
          <button type="button" className={`my-profile-tab ${tab === 'skills' ? 'my-profile-tab-active' : ''}`} onClick={() => setTab('skills')}>
            <ShieldCheck size={14} />
            Skills
          </button>
        </div>

        {tab === 'personal' ? (
          <div className="my-profile-section">
            <div className="card-header">
              <div>
                <h3 className="card-title">Personal information</h3>
                <p className="card-subtitle">This section is employee-managed and updates your self-service contact record directly.</p>
              </div>
            </div>
            <div className="my-profile-form-grid">
              <Field label="Email"><input value={personalForm.email} onChange={(event) => setPersonalForm((current) => ({ ...current, email: event.target.value }))} /></Field>
              <Field label="Phone"><input value={personalForm.phone} onChange={(event) => setPersonalForm((current) => ({ ...current, phone: event.target.value }))} /></Field>
              <Field label="Address line 1"><input value={personalForm.addressLine1} onChange={(event) => setPersonalForm((current) => ({ ...current, addressLine1: event.target.value }))} /></Field>
              <Field label="Address line 2"><input value={personalForm.addressLine2} onChange={(event) => setPersonalForm((current) => ({ ...current, addressLine2: event.target.value }))} /></Field>
              <Field label="City"><input value={personalForm.city} onChange={(event) => setPersonalForm((current) => ({ ...current, city: event.target.value }))} /></Field>
              <Field label="Province"><input value={personalForm.province} onChange={(event) => setPersonalForm((current) => ({ ...current, province: event.target.value }))} /></Field>
              <Field label="Postal code"><input value={personalForm.postalCode} onChange={(event) => setPersonalForm((current) => ({ ...current, postalCode: event.target.value }))} /></Field>
              <Field label="Country"><input value={personalForm.country} onChange={(event) => setPersonalForm((current) => ({ ...current, country: event.target.value }))} /></Field>
              <Field label="Emergency contact"><input value={personalForm.emergencyName} onChange={(event) => setPersonalForm((current) => ({ ...current, emergencyName: event.target.value }))} /></Field>
              <Field label="Emergency phone"><input value={personalForm.emergencyPhone} onChange={(event) => setPersonalForm((current) => ({ ...current, emergencyPhone: event.target.value }))} /></Field>
              <Field label="Relationship"><input value={personalForm.emergencyRelation} onChange={(event) => setPersonalForm((current) => ({ ...current, emergencyRelation: event.target.value }))} /></Field>
            </div>
            <div className="my-profile-actions">
              <button type="button" className="button" onClick={() => { void submitPersonalProfile(); }} disabled={saving}>
                {saving ? <LoaderCircle className="my-profile-spin" size={16} /> : <Save size={16} />}
                Save personal info
              </button>
            </div>
          </div>
        ) : null}

        {tab === 'employment' ? (
          <div className="my-profile-section">
            <div className="card-header">
              <div>
                <h3 className="card-title">Employment information</h3>
                <p className="card-subtitle">Employment, position, and pay fields are HR-managed and remain read-only here.</p>
              </div>
            </div>
            <div className="my-profile-readonly-grid">
              <ReadonlyField label="Employee number" value={profile.employeeNumber} />
              <ReadonlyField label="Job title" value={profile.employmentInfo.jobTitle} />
              <ReadonlyField label="Department" value={profile.employmentInfo.department} />
              <ReadonlyField label="Status" value={profile.employmentInfo.status} />
              <ReadonlyField label="Manager" value={profile.employmentInfo.manager?.fullName ?? 'Not assigned'} />
              <ReadonlyField label="Position" value={profile.employmentInfo.position ? `${profile.employmentInfo.position.positionCode} | ${profile.employmentInfo.position.title}` : 'Not assigned'} />
              <ReadonlyField label="Org unit" value={profile.employmentInfo.orgUnit ? `${profile.employmentInfo.orgUnit.code} | ${profile.employmentInfo.orgUnit.name}` : 'Not assigned'} />
              <ReadonlyField label="Pay frequency" value={profile.employmentInfo.payFrequency} />
              <ReadonlyField label="Base salary" value={formatCurrency(profile.employmentInfo.salary)} />
            </div>
          </div>
        ) : null}

        {tab === 'skills' ? (
          <div className="my-profile-skills-layout">
            <div className="my-profile-section">
              <div className="card-header">
                <div>
                  <h3 className="card-title">{editingSkillId ? 'Update skill' : 'Add skill'}</h3>
                  <p className="card-subtitle">Choose from the HR-managed skills taxonomy and keep your self-identified skills current. Validation stays internal to managers and HR.</p>
                </div>
              </div>
              <div className="my-profile-form-grid">
                <Field label="Skill">
                  <select value={skillForm.skillTagId} onChange={(event) => setSkillForm((current) => ({ ...current, skillTagId: event.target.value }))} disabled={Boolean(editingSkillId)}>
                    <option value="">Select skill</option>
                    {taxonomy.map((category) => (
                      <optgroup key={category.id} label={category.name}>
                        {category.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </Field>
                <Field label="Self-reported level">
                  <input value={skillForm.selfReportedLevel} onChange={(event) => setSkillForm((current) => ({ ...current, selfReportedLevel: event.target.value }))} placeholder="Example: Intermediate" />
                </Field>
                <Field label="Confidence">
                  <select value={skillForm.confidence} onChange={(event) => setSkillForm((current) => ({ ...current, confidence: event.target.value }))}>
                    <option value="">Select</option>
                    <option value="1">1 | Emerging</option>
                    <option value="2">2 | Developing</option>
                    <option value="3">3 | Proficient</option>
                    <option value="4">4 | Strong</option>
                    <option value="5">5 | Expert</option>
                  </select>
                </Field>
              </div>
              <div className="my-profile-actions">
                <button type="button" className="button button-outline" onClick={() => { setEditingSkillId(null); setSkillForm(emptySkillForm); }}>
                  Clear
                </button>
                <button type="button" className="button" onClick={() => { void submitSkill(); }} disabled={saving}>
                  {saving ? <LoaderCircle className="my-profile-spin" size={16} /> : editingSkillId ? <PencilLine size={16} /> : <Plus size={16} />}
                  {editingSkillId ? 'Save skill' : 'Add skill'}
                </button>
              </div>
            </div>

            <div className="my-profile-section">
              <div className="card-header">
                <div>
                  <h3 className="card-title">My skills</h3>
                  <p className="card-subtitle">Self-identified skills visible on your profile and available for future learning alignment.</p>
                </div>
              </div>
              {skills.length === 0 ? (
                <div className="my-profile-empty">No skills have been added yet.</div>
              ) : (
                <div className="my-profile-skill-list">
                  {skills.map((skill) => (
                    <article key={skill.id} className="my-profile-skill-card">
                      <div className="my-profile-skill-header">
                        <div>
                          <h4>{skill.skillTag.name}</h4>
                          <p>{skill.skillTag.category?.name ?? 'Skill'} | {skill.selfReportedLevel ?? 'Level not supplied'}</p>
                        </div>
                        <span className="badge badge-primary">{skill.confidence ? `${skill.confidence}/5 confidence` : 'Confidence not set'}</span>
                      </div>
                      {skill.skillTag.description ? <p className="my-profile-skill-copy">{skill.skillTag.description}</p> : null}
                      <div className="my-profile-skill-actions">
                        <button type="button" className="button button-outline" onClick={() => beginEditSkill(skill)}>
                          <PencilLine size={16} />
                          Edit
                        </button>
                        <button type="button" className="button button-outline my-profile-danger-outline" onClick={() => { void removeSkill(skill.id); }}>
                          <Trash2 size={16} />
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="my-profile-summary-card">
      <span className="my-profile-summary-label">{label}</span>
      <strong className="my-profile-summary-value">{value}</strong>
      <span className="my-profile-summary-detail">{detail}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="my-profile-field"><span>{label}</span>{children}</label>;
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="my-profile-readonly-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
