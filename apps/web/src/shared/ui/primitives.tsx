import { useEffect, type ButtonHTMLAttributes, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function useOverlayLifecycle(onClose?: () => void) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);
}

interface OverlaySurfaceProps {
  children: ReactNode;
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  backdropClassName?: string;
}

function OverlaySurface({
  children,
  onClose,
  closeOnBackdrop = true,
  backdropClassName,
}: OverlaySurfaceProps) {
  useOverlayLifecycle(onClose);

  const onBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!closeOnBackdrop || event.target !== event.currentTarget) {
      return;
    }

    onClose?.();
  };

  return (
    <div className={cx('ui-overlay-backdrop', backdropClassName)} role="presentation" onClick={onBackdropClick}>
      {children}
    </div>
  );
}

export interface PageHeroProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  headerClassName?: string;
  variant?: 'default' | 'analytics' | 'neutral';
}

export function PageHero({
  eyebrow,
  title,
  subtitle,
  badge,
  actions,
  children,
  className,
  headerClassName,
  variant = 'default',
}: PageHeroProps) {
  return (
    <section className={cx('card ui-page-hero', `ui-page-hero-${variant}`, className)}>
      <div className={cx('page-header ui-page-hero-header', headerClassName)}>
        <div className="ui-page-hero-copy">
          {eyebrow ? <span className="ui-page-hero-eyebrow">{eyebrow}</span> : null}
          <div>
            <h1 className="page-title">{title}</h1>
            {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
          </div>
        </div>
        {badge || actions ? (
          <div className="ui-page-hero-aside">
            {badge ? <div className="ui-page-hero-badge">{badge}</div> : null}
            {actions ? <div className="ui-page-hero-actions">{actions}</div> : null}
          </div>
        ) : null}
      </div>
      {children ? <div className="ui-page-hero-body">{children}</div> : null}
    </section>
  );
}

export interface CrudToolbarProps {
  search?: ReactNode;
  controls?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function CrudToolbar({ search, controls, actions, className }: CrudToolbarProps) {
  return (
    <div className={cx('ui-crud-toolbar', className)}>
      {search ? <div className="ui-crud-toolbar-search">{search}</div> : null}
      {controls ? <div className="ui-crud-toolbar-controls">{controls}</div> : null}
      {actions ? <div className="ui-crud-toolbar-actions">{actions}</div> : null}
    </div>
  );
}

export interface DataListSurfaceProps {
  desktop: ReactNode;
  mobile?: ReactNode;
  className?: string;
  desktopClassName?: string;
  mobileClassName?: string;
}

export function DataListSurface({
  desktop,
  mobile,
  className,
  desktopClassName,
  mobileClassName,
}: DataListSurfaceProps) {
  return (
    <div className={cx('ui-data-surface', className)}>
      <div className={cx('ui-data-surface-desktop', desktopClassName)} data-mobile-hidden={mobile ? 'true' : undefined}>{desktop}</div>
      {mobile ? <div className={cx('ui-data-surface-mobile', mobileClassName)}>{mobile}</div> : null}
    </div>
  );
}

export interface BannerProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'success' | 'warning' | 'error';
  icon?: ReactNode;
}

export function Banner({
  tone = 'info',
  icon,
  className,
  children,
  ...props
}: BannerProps) {
  return (
    <div className={cx('ui-banner', `ui-banner-${tone}`, className)} {...props}>
      {icon ? <span className="ui-banner-icon">{icon}</span> : null}
      <span>{children}</span>
    </div>
  );
}

export interface ActionGroupProps extends HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'end';
}

export function ActionGroup({
  align = 'start',
  className,
  children,
  ...props
}: ActionGroupProps) {
  return (
    <div className={cx('ui-action-group', align === 'end' && 'ui-action-group-end', className)} {...props}>
      {children}
    </div>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tone?: 'default' | 'danger';
}

export function IconButton({
  label,
  tone = 'default',
  className,
  type = 'button',
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx('ui-icon-button', tone === 'danger' && 'ui-icon-button-danger', className)}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}

interface SurfaceFrameProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  className?: string;
  bodyClassName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  panelType: 'modal' | 'drawer';
  role?: 'dialog';
}

function SurfaceFrame({
  title,
  subtitle,
  children,
  footer,
  onClose,
  closeLabel = 'Close',
  className,
  bodyClassName,
  size = 'md',
  panelType,
  role = 'dialog',
}: SurfaceFrameProps) {
  return (
    <div
      className={cx(
        'ui-surface-frame',
        panelType === 'drawer' ? 'ui-surface-drawer' : 'ui-surface-modal',
        `ui-surface-size-${size}`,
        className,
      )}
      role={role}
      aria-modal="true"
    >
      {(title || subtitle || onClose) ? (
        <div className="ui-surface-header">
          <div>
            {title ? <h2 className="card-title">{title}</h2> : null}
            {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
          </div>
          {onClose ? <button type="button" className="button button-outline ui-surface-close" onClick={onClose}>{closeLabel}</button> : null}
        </div>
      ) : null}
      <div className={cx('ui-surface-body', bodyClassName)}>{children}</div>
      {footer ? <div className="ui-surface-footer">{footer}</div> : null}
    </div>
  );
}

export interface ModalProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  closeLabel?: string;
  className?: string;
  bodyClassName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  backdropClassName?: string;
}

export function Modal({
  onClose,
  closeOnBackdrop,
  backdropClassName,
  ...props
}: ModalProps) {
  return (
    <OverlaySurface onClose={onClose} closeOnBackdrop={closeOnBackdrop} backdropClassName={backdropClassName}>
      <SurfaceFrame panelType="modal" onClose={onClose} {...props} />
    </OverlaySurface>
  );
}

export interface ConfirmDialogProps {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
  confirmDisabled?: boolean;
  closeOnBackdrop?: boolean;
  tone?: 'default' | 'danger';
  className?: string;
  size?: 'sm' | 'md';
}

export function ConfirmDialog({
  title,
  subtitle,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onClose,
  confirmDisabled = false,
  closeOnBackdrop = true,
  tone = 'default',
  className,
  size = 'sm',
}: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      closeOnBackdrop={closeOnBackdrop}
      size={size}
      className={className}
      footer={(
        <ActionGroup align="end">
          <button type="button" className="button button-outline" onClick={onClose}> {cancelLabel}</button>
          <button type="button" className={cx('button', tone === 'danger' && 'ui-button-danger')} onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </button>
        </ActionGroup>
      )}
    >
      {children}
    </Modal>
  );
}

export interface DrawerProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  closeLabel?: string;
  className?: string;
  bodyClassName?: string;
  size?: 'md' | 'lg' | 'xl';
  backdropClassName?: string;
}

export function Drawer({
  onClose,
  closeOnBackdrop,
  backdropClassName,
  ...props
}: DrawerProps) {
  return (
    <OverlaySurface onClose={onClose} closeOnBackdrop={closeOnBackdrop} backdropClassName={cx('ui-overlay-drawer', backdropClassName)}>
      <SurfaceFrame panelType="drawer" onClose={onClose} {...props} />
    </OverlaySurface>
  );
}

export function SurfaceField({
  label,
  children,
  fullWidth = false,
  className,
}: {
  label: string;
  children: ReactNode;
  fullWidth?: boolean;
  className?: string;
}) {
  return (
    <label className={cx('ui-surface-field', fullWidth && 'ui-surface-field-full', className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}
