import { parseLearningTagList } from './learning-ops';

export interface LearningProviderAdapterContent {
  providerContentId: string;
  title: string;
  description: string | null;
  modality: string;
  durationMinutes: number | null;
  thumbnailUrl: string | null;
  launchUrl: string;
  tags: string[];
  versionLabel: string | null;
  certificateEligible: boolean;
  contentStatus: string;
}

export interface LearningProviderAdapter {
  syncCatalog(provider: {
    code: string;
    displayName: string;
    defaultLaunchBaseUrl: string | null;
    connectionMetadata: string | null;
  }): Promise<LearningProviderAdapterContent[]>;
}

const presetCatalogs: Record<string, LearningProviderAdapterContent[]> = {
  'skillstream-core': [
    {
      providerContentId: 'cyber-essentials-2026',
      title: 'Cybersecurity Essentials 2026',
      description: 'Core security awareness training covering phishing, password hygiene, and incident reporting.',
      modality: 'Video',
      durationMinutes: 45,
      thumbnailUrl: null,
      launchUrl: '/catalog/cybersecurity-essentials-2026',
      tags: ['Security', 'Compliance', 'Required'],
      versionLabel: '2026.1',
      certificateEligible: true,
      contentStatus: 'Active',
    },
    {
      providerContentId: 'mgr-coaching-foundations',
      title: 'Coaching Foundations for People Leaders',
      description: 'Manager essentials for feedback, one-on-ones, and development conversations.',
      modality: 'Video',
      durationMinutes: 60,
      thumbnailUrl: null,
      launchUrl: '/catalog/coaching-foundations',
      tags: ['Leadership', 'Management'],
      versionLabel: '2026.1',
      certificateEligible: false,
      contentStatus: 'Active',
    },
    {
      providerContentId: 'accessibility-design-basics',
      title: 'Accessibility and Inclusive Design Basics',
      description: 'Practical accessibility foundations for product, design, and engineering roles.',
      modality: 'SCORM',
      durationMinutes: 35,
      thumbnailUrl: null,
      launchUrl: '/catalog/accessibility-design-basics',
      tags: ['Design', 'Product', 'Recommended'],
      versionLabel: '2026.1',
      certificateEligible: false,
      contentStatus: 'Active',
    },
    {
      providerContentId: 'privacy-data-handling',
      title: 'Privacy and Responsible Data Handling',
      description: 'Mandatory privacy expectations for employee and customer data handling.',
      modality: 'PDF',
      durationMinutes: 25,
      thumbnailUrl: null,
      launchUrl: '/catalog/privacy-data-handling',
      tags: ['Privacy', 'Compliance', 'Required'],
      versionLabel: '2026.1',
      certificateEligible: true,
      contentStatus: 'Active',
    },
    {
      providerContentId: 'finance-controls-overview',
      title: 'Finance Controls and Approval Discipline',
      description: 'Workflow, documentation, and approval discipline for finance operations.',
      modality: 'Link',
      durationMinutes: 30,
      thumbnailUrl: null,
      launchUrl: '/catalog/finance-controls-overview',
      tags: ['Finance', 'Controls'],
      versionLabel: '2026.1',
      certificateEligible: false,
      contentStatus: 'Active',
    },
  ],
};

function getCatalogPresetName(provider: {
  code: string;
  connectionMetadata: string | null;
}) {
  if (!provider.connectionMetadata) {
    return provider.code.toLowerCase();
  }

  try {
    const metadata = JSON.parse(provider.connectionMetadata) as {
      catalogPreset?: string;
    };
    return metadata.catalogPreset ?? provider.code.toLowerCase();
  } catch {
    return provider.code.toLowerCase();
  }
}

function buildLaunchUrl(baseUrl: string | null, relativeUrl: string) {
  if (!baseUrl) {
    return relativeUrl.startsWith('http')
      ? relativeUrl
      : `https://learning.elevatehr.dev${relativeUrl}`;
  }

  return `${baseUrl.replace(/\/$/, '')}${relativeUrl}`;
}

const genericExternalAdapter: LearningProviderAdapter = {
  async syncCatalog(provider) {
    const presetName = getCatalogPresetName(provider);
    const presetCatalog = presetCatalogs[presetName] ?? [];

    return presetCatalog.map((content) => ({
      ...content,
      launchUrl: buildLaunchUrl(provider.defaultLaunchBaseUrl, content.launchUrl),
      tags: parseLearningTagList(content.tags.join(', ')),
    }));
  },
};

export function resolveLearningProviderAdapter(_provider: {
  code: string;
  providerType: string;
}) {
  return genericExternalAdapter;
}
