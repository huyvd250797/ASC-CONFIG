import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_BUTTON_LABEL,
  TOOL_LIMITS,
  hostOf,
  removeTool,
  saveTool,
  useTools,
  type ToolLink,
} from '../lib/tools';
import { sharedBackendEnabled } from '../config';
import { usePinGate } from '../lib/pin';
import { useToast } from '../lib/toast';
import { useModalScrollLock } from '../lib/modalScrollLock';

type Draft = {
  id?: string;
  name: string;
  desc: string;
  url: string;
  buttonLabel: string;
  order: string;
};

const emptyDraft: Draft = { name: '', desc: '', url: '', buttonLabel: DEFAULT_BUTTON_LABEL, order: '' };

function draftOf(tool: ToolLink): Draft {
  return {
    id: tool.id,
    name: tool.name,
    desc: tool.desc,
    url: tool.url,
    buttonLabel: tool.buttonLabel,
    order: tool.order ? String(tool.order) : '',
  };
}

export function ToolsModal({ onClose }: { onClose: () => void }) {
  const { tools, loading, error, reload } = useTools();
  const requirePin = usePinGate();
  const notify = useToast();
  const shared = sharedBackendEnabled();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const draftKey = draft ? draft.id || '__new__' : '';

  useModalScrollLock();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (draft) setDraft(null);
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [draft, onClose]);

  useEffect(() => {
    if (!draftKey) return;
    const frame = window.requestAnimationFrame(() => nameRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [draftKey]);

  const editing = Boolean(draft?.id);
  const subtitle = useMemo(() => {
    const count = `${tools.length} chức năng`;
    return shared ? `${count} · dùng chung cho cả đội` : `${count} · lưu trên máy này`;
  }, [tools.length, shared]);

  /* ---------------- thao tác quản trị, đều qua cổng PIN ---------------- */

  const openAdd = async () => {
    const allowed = await requirePin('Thêm chức năng khác', 'Thao tác này cần mã PIN quản trị.');
    if (!allowed) return;
    setFormError('');
    setDraft({ ...emptyDraft });
  };

  const openEdit = async (tool: ToolLink) => {
    const allowed = await requirePin(`Sửa chức năng: ${tool.name}`, 'Thao tác này cần mã PIN quản trị.');
    if (!allowed) return;
    setFormError('');
    setDraft(draftOf(tool));
  };

  const askRemove = async (tool: ToolLink) => {
    const allowed = await requirePin(
      `Xóa chức năng: ${tool.name}`,
      'Thao tác không thể hoàn tác, cần mã PIN quản trị.',
    );
    if (!allowed) return;

    setBusyId(tool.id);
    try {
      await removeTool(tool.id);
      if (draft?.id === tool.id) setDraft(null);
      notify({ kind: 'info', title: 'Đã xóa chức năng', detail: tool.name });
    } catch (err) {
      notify({
        kind: 'error',
        title: 'Không xóa được chức năng',
        detail: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusyId('');
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;

    setSaving(true);
    setFormError('');
    try {
      await saveTool({
        id: draft.id,
        name: draft.name,
        desc: draft.desc,
        url: draft.url,
        buttonLabel: draft.buttonLabel,
        order: Number(draft.order) || 0,
      });
      notify({
        kind: 'success',
        title: editing ? 'Đã cập nhật chức năng' : 'Đã thêm chức năng',
        detail: draft.name.trim(),
      });
      setDraft(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không lưu được chức năng.');
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: keyof Draft, value: string) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setFormError('');
  };

  const showLoading = loading && tools.length === 0;

  return (
    <div className="modal-backdrop" onClick={() => { if (!draft) onClose(); }}>
      <section
        className="detail-modal tools-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Chức năng khác"
      >
        <header>
          <div className="detail-title">
            <h2>Chức năng khác</h2>
            <p className="detail-sub">{subtitle}</p>
          </div>
          <div className="detail-actions">
            {shared && (
              <button
                type="button"
                className="copy-button"
                onClick={() => void reload()}
                disabled={loading}
                title="Tải lại danh sách từ máy chủ"
              >
                {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                Tải lại
              </button>
            )}
            <button type="button" className="copy-button primary" onClick={() => void openAdd()}>
              <Plus size={14} />
              Thêm
            </button>
            <button className="close-button" onClick={onClose} aria-label="Đóng danh sách chức năng">
              <X size={19} />
            </button>
          </div>
        </header>

        {error && !showLoading && (
          <div className="stats-error" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button type="button" className="copy-button" onClick={() => void reload()}>
              Thử lại
            </button>
          </div>
        )}

        <div className="detail-body tools-body">
          {draft && (
            <form className="tool-form" onSubmit={submit}>
              <div className="tool-form-head">
                <strong>{editing ? 'Sửa chức năng' : 'Thêm chức năng mới'}</strong>
                <button
                  type="button"
                  className="close-button small"
                  onClick={() => setDraft(null)}
                  aria-label="Đóng biểu mẫu"
                >
                  <X size={16} />
                </button>
              </div>

              <label className="tool-field">
                <span>Tên chức năng</span>
                <input
                  ref={nameRef}
                  value={draft.name}
                  maxLength={TOOL_LIMITS.name}
                  onChange={(event) => setField('name', event.target.value)}
                  placeholder="Ví dụ: Công cụ sinh script SQL"
                  required
                />
              </label>

              <label className="tool-field">
                <span>Mô tả</span>
                <textarea
                  value={draft.desc}
                  maxLength={TOOL_LIMITS.desc}
                  rows={3}
                  onChange={(event) => setField('desc', event.target.value)}
                  placeholder="Chức năng này dùng để làm gì, ai nên dùng..."
                />
                <em className="tool-count">
                  {draft.desc.length}/{TOOL_LIMITS.desc}
                </em>
              </label>

              <label className="tool-field">
                <span>Link</span>
                <input
                  value={draft.url}
                  maxLength={TOOL_LIMITS.url}
                  onChange={(event) => setField('url', event.target.value)}
                  placeholder="vi-du.netlify.app hoặc https://..."
                  inputMode="url"
                  required
                />
              </label>

              <div className="tool-field-row">
                <label className="tool-field">
                  <span>Chữ trên nút</span>
                  <input
                    value={draft.buttonLabel}
                    maxLength={TOOL_LIMITS.buttonLabel}
                    onChange={(event) => setField('buttonLabel', event.target.value)}
                    placeholder={DEFAULT_BUTTON_LABEL}
                  />
                </label>
                <label className="tool-field">
                  <span>Thứ tự</span>
                  <input
                    value={draft.order}
                    inputMode="numeric"
                    onChange={(event) => setField('order', event.target.value.replace(/[^\d-]/g, ''))}
                    placeholder="0"
                  />
                </label>
              </div>

              {formError && (
                <p className="tool-form-error" role="alert">
                  <AlertTriangle size={14} />
                  {formError}
                </p>
              )}

              <div className="tool-form-actions">
                <button type="button" className="ghost-button" onClick={() => setDraft(null)}>
                  Hủy
                </button>
                <button type="submit" className="search-submit" disabled={saving}>
                  {saving ? <Loader2 size={14} className="spin" /> : null}
                  {editing ? 'Lưu thay đổi' : 'Thêm chức năng'}
                </button>
              </div>
            </form>
          )}

          {showLoading ? (
            <div className="stats-loading" role="status" aria-live="polite">
              <Loader2 className="spin" size={34} />
              <h3>Đang tải danh sách</h3>
              <p>Đang lấy các chức năng dùng chung từ hệ thống…</p>
            </div>
          ) : tools.length === 0 ? (
            <div className="empty-state tools-empty">
              <Boxes size={28} />
              <h3>Chưa có chức năng nào</h3>
              <p>Bấm “Thêm” để gắn link tới công cụ, biểu mẫu hoặc trang khác của đội.</p>
            </div>
          ) : (
            <ul className="tool-list">
              {tools.map((tool) => (
                <li key={tool.id} className={`tool-card ${busyId === tool.id ? 'busy' : ''}`}>
                  <div className="tool-card-main">
                    <div className="tool-card-head">
                      <h3>{tool.name}</h3>
                      <div className="tool-card-admin">
                        <button
                          type="button"
                          className="tool-icon-button"
                          onClick={() => void openEdit(tool)}
                          title="Sửa chức năng"
                          aria-label={`Sửa ${tool.name}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="tool-icon-button danger"
                          onClick={() => void askRemove(tool)}
                          disabled={busyId === tool.id}
                          title="Xóa chức năng"
                          aria-label={`Xóa ${tool.name}`}
                        >
                          {busyId === tool.id ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                        </button>
                      </div>
                    </div>

                    {tool.desc && <p className="tool-desc">{tool.desc}</p>}

                    <p className="tool-host" title={tool.url}>
                      <Link2 size={13} />
                      {hostOf(tool.url)}
                    </p>
                  </div>

                  <a
                    className="tool-open"
                    href={tool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span>{tool.buttonLabel || DEFAULT_BUTTON_LABEL}</span>
                    <ArrowUpRight size={16} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="stats-foot">
          {shared
            ? 'Danh sách dùng chung, lưu ở sheet ChucNang qua Apps Script. Thêm, sửa, xóa đều cần mã PIN quản trị.'
            : 'Danh sách đang lưu trên trình duyệt của máy này. Khai báo STATS_ENDPOINT trong src/config.ts để cả đội dùng chung.'}
        </footer>
      </section>
    </div>
  );
}
