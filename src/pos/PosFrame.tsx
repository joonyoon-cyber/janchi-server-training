import { useEffect, useRef, useState } from 'react';
import { usePos } from '../lib/store';
import { DialogHost } from './common';
import { FloorScreen } from './FloorScreen';
import { MainScreen } from './MainScreen';
import { OrderScreen } from './OrderScreen';
import { TenderScreen } from './TenderScreen';

export type Zoom = 'fit' | 'actual';

/**
 * The POS is laid out on a fixed 1024x768 screen and scaled uniformly, so
 * button positions never change between desktop, tablet and phone.
 */
export function PosFrame({ zoom }: { zoom: Zoom }) {
  const screen = usePos((s) => s.screen);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      setScale(Math.max(0.2, Math.min((width - 12) / 1024, (height - 12) / 768)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const s = zoom === 'fit' ? scale : 1;
  return (
    <div ref={box} className={`relative h-full w-full ${zoom === 'fit' ? 'overflow-hidden' : 'overflow-auto'}`}>
      <div style={{ width: 1024 * s, height: 768 * s, margin: zoom === 'fit' ? '6px auto' : 6 }}>
        <div
          data-testid="pos-root"
          style={{ width: 1024, height: 768, transform: `scale(${s})`, transformOrigin: 'top left', boxShadow: '0 0 0 5px #0b0f17, 0 8px 24px rgba(0,0,0,.6)', borderRadius: 2 }}
        >
          <div className="pos-screen">
            {screen === 'main' && <MainScreen />}
            {screen === 'floor' && <FloorScreen />}
            {screen === 'order' && <OrderScreen />}
            {screen === 'tender' && <TenderScreen />}
            <DialogHost />
          </div>
        </div>
      </div>
    </div>
  );
}
