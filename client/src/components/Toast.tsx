import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';

interface ToastMsg { id: number; text: string; kind: 'info' | 'error' }
interface ToastCtx { show: (text: string, kind?: 'info' | 'error') => void }

const Ctx = createContext<ToastCtx>({ show: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msgs, setMsgs] = useState<ToastMsg[]>([]);
  const seq = useRef(0);

  const show = useCallback((text: string, kind: 'info' | 'error' = 'info') => {
    const id = ++seq.current;
    setMsgs(m => [...m, { id, text, kind }]);
    setTimeout(() => setMsgs(m => m.filter(x => x.id !== id)), kind === 'error' ? 4000 : 2200);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="toast-wrap">
        {msgs.map(m => (
          <div key={m.id} className={`toast ${m.kind}`}>{m.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
