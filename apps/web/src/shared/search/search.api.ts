import { apiRequest, buildQuery } from '@/shared/lib/api';

export type GlobalSearchResultType =
  | 'employee'
  | 'position'
  | 'job_request'
  | 'inbox_item'
  | 'learning_content'
  | 'workspace';

export interface GlobalSearchResultItem {
  id: string;
  type: GlobalSearchResultType;
  title: string;
  subtitle: string;
  route: string;
  badge: string | null;
}

export interface GlobalSearchResultGroup {
  type: GlobalSearchResultType;
  label: string;
  items: GlobalSearchResultItem[];
}

export async function searchGlobal(query: string, limit = 5) {
  const response = await apiRequest<{
    success: true;
    data: {
      groups: GlobalSearchResultGroup[];
    };
  }>(
    `/api/search${buildQuery({ q: query, limit })}`,
    {},
    'Unable to run the global search.',
  );

  return response.data;
}
