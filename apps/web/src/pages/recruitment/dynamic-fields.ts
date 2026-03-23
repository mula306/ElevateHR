import type { DynamicFieldDefinition } from './recruitment.api';

export const dynamicFieldTypeOptions: Array<{ value: DynamicFieldDefinition['type']; label: string }> = [
  { value: 'text', label: 'Single line text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Select list' },
  { value: 'date', label: 'Date' },
];

export interface DynamicFieldValidationErrors {
  key?: string;
  label?: string;
  options?: string;
}

export function slugifyDynamicFieldKey(label: string) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) {
    return 'field';
  }

  return /^[a-z]/.test(normalized) ? normalized : `field_${normalized}`;
}

export function createEmptyDynamicField(index: number): DynamicFieldDefinition {
  return {
    key: `field_${index + 1}`,
    label: '',
    type: 'text',
    required: false,
  };
}

export function validateDynamicField(field: DynamicFieldDefinition, allFields: DynamicFieldDefinition[]) {
  const errors: DynamicFieldValidationErrors = {};

  if (!field.label.trim()) {
    errors.label = 'Label is required.';
  }

  if (!field.key.trim()) {
    errors.key = 'Key is required.';
  } else if (!/^[a-z][a-z0-9_]*$/.test(field.key)) {
    errors.key = 'Use lowercase letters, numbers, and underscores. Start with a letter.';
  } else if (allFields.filter((candidate) => candidate.key === field.key).length > 1) {
    errors.key = 'Keys must be unique.';
  }

  if (field.type === 'select') {
    if (!field.options || field.options.length === 0) {
      errors.options = 'Select fields need at least one option.';
    }
  } else if (field.options && field.options.length > 0) {
    errors.options = 'Only select fields can use options.';
  }

  return errors;
}

export function validateDynamicFieldSchema(fields: DynamicFieldDefinition[]) {
  const fieldErrors = fields.map((field) => validateDynamicField(field, fields));
  const hasErrors = fieldErrors.some((errors) => Object.keys(errors).length > 0);
  return { fieldErrors, hasErrors };
}

export function validateDynamicFieldValue(field: DynamicFieldDefinition, value: string) {
  const trimmed = value.trim();

  if (field.required && !trimmed) {
    return `${field.label} is required.`;
  }

  if (!trimmed) {
    return null;
  }

  if (field.type === 'number' && Number.isNaN(Number(trimmed))) {
    return `${field.label} must be a valid number.`;
  }

  if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${field.label} must use YYYY-MM-DD format.`;
  }

  if (field.type === 'select' && field.options && !field.options.includes(trimmed)) {
    return `${field.label} must use one of the configured options.`;
  }

  return null;
}
