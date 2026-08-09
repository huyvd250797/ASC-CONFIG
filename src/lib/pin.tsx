import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { KeyRound, X } from 'lucide-react';
import { sha256Hex } from './sha256';
import { useModalScrollLock } from './modalScrollLock';

/**
 * Yêu cầu nhập mã PIN trước khi cho phép một thao tác nhạy cảm.
 *
 * Mã PIN KHÔNG nằm trong source dưới dạng chữ rõ; chỉ có bản băm SHA-256 kèm salt.
 * Nhập vào bao nhiêu cũng chỉ được so bằng giá trị băm, nên đọc source không lần ra được PIN.
 *
 * Lưu ý về mức độ bảo vệ: đây là app chạy hoàn toàn phía trình duyệt, mọi thứ đều nằm trong
 * tay người dùng. Cổng PIN này đủ để chặn thao tác nhầm và người dùng thông thường, nhưng
 * không phải là biện pháp bảo mật thật — ai biết kỹ thuật vẫn có thể dò PIN 6 số bằng cách
 * thử toàn bộ 10^6 khả năng trên bản băm. Muốn bảo vệ thật thì phải kiểm tra ở phía máy chủ.
 */

const PIN_SALT = 'asc-config-pin::v1';
/** SHA-256 của (salt + mã PIN). */
const PIN_HASH = '578b9a5ac4e8720660877cab9797e24d9416fae14adef8dcf6605dddf1d36a26';
export const PIN_LENGTH = 6;

export function verifyPin(input: string) {
  return sha256Hex(PIN_SALT + input) === PIN_HASH;
}

type PinRequest = {
  title: string;
  detail?: string;
  resolve: (allowed: boolean) => void;
};

const PinContext = createContext<(title: string, detail?: string) => Promise<boolean>>(async () => false);

/** Trả về hàm mở hộp thoại PIN; `await` cho tới khi người dùng nhập đúng hoặc hủy. */
export function usePinGate() {
  return useContext(PinContext);
}

function PinDialog({ request, onClose }: { request: PinRequest; onClose: (allowed: boolean) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useModalScrollLock();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (value.length < PIN_LENGTH) {
      setError(`Mã PIN gồm ${PIN_LENGTH} chữ số.`);
      return;
    }
    if (verifyPin(value)) {
      onClose(true);
      return;
    }
    setError('Mã PIN không đúng.');
    setValue('');
    setShake(true);
    window.setTimeout(() => setShake(false), 400);
    inputRef.current?.focus();
  };

  return (
    <div className="modal-backdrop" onClick={() => onClose(false)}>
      <section
        className={`pin-dialog ${shake ? 'shake' : ''}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div className="pin-icon">
            <KeyRound size={18} />
          </div>
          <div>
            <h2>{request.title}</h2>
            {request.detail && <p>{request.detail}</p>}
          </div>
          <button type="button" className="close-button" onClick={() => onClose(false)} aria-label="Hủy">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submit}>
          <input
            ref={inputRef}
            className="pin-input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={PIN_LENGTH}
            placeholder="••••••"
            aria-label="Mã PIN"
            value={value}
            onChange={(event) => {
              setValue(event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH));
              setError('');
            }}
          />
          <p className={`pin-message ${error ? 'error' : ''}`}>{error || `Nhập mã PIN ${PIN_LENGTH} số để tiếp tục.`}</p>
          <div className="pin-actions">
            <button type="button" className="ghost-button" onClick={() => onClose(false)}>
              Hủy
            </button>
            <button type="submit" className="search-submit" disabled={value.length < PIN_LENGTH}>
              Xác nhận
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function PinProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PinRequest | null>(null);

  const requirePin = useCallback(
    (title: string, detail?: string) =>
      new Promise<boolean>((resolve) => {
        setRequest({ title, detail, resolve });
      }),
    [],
  );

  const close = useCallback(
    (allowed: boolean) => {
      request?.resolve(allowed);
      setRequest(null);
    },
    [request],
  );

  const value = useMemo(() => requirePin, [requirePin]);

  return (
    <PinContext.Provider value={value}>
      {children}
      {request && <PinDialog request={request} onClose={close} />}
    </PinContext.Provider>
  );
}
