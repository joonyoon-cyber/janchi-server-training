import { useEffect, useRef, useState } from 'react';
import { usePos } from '../lib/store';
import { DialogHost } from './common';
import { FloorScreen } from './FloorScreen';
import { MainScreen } from './MainScreen';
import { OrderScreen } from './OrderScreen';
import { TenderListScreen } from './TenderListScreen';
import { TenderScreen } from './TenderScreen';
import { TipAdjustScreen } from './TipAdjustScreen';

/** 'fit' scales the POS to the window; a percentage shows it at that size with scrolling. */
export type Zoom = 'fit' | '50' | '75' | '100' | '125' | '150';
export const ZOOMS: { value: Zoom; label: string }[] = [
  { value: 'fit', label: 'Fit screen' },
  { value: '50', label: '50%' },
  { value: '75', label: '75%' },
  { value: '100', label: '100%' },
  { value: '125', label: '125%' },
  { value: '150', label: '150%' },
];

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

  const s = zoom === 'fit' ? scale : Number(zoom) / 100;
  return (
    <div ref={box} className={`relative h-full w-full ${zoom === 'fit' ? 'overflow-hidden' : 'overflow-auto'}`}>
      <div style={{ width: 1024 * s, height: 768 * s, margin: '6px auto' }}>
        <div
          data-testid="pos-root"
          style={{ width: 1024, height: 768, transform: `scale(${s})`, transformOrigin: 'top left', boxShadow: '0 0 0 5px #0b0f17, 0 8px 24px rgba(0,0,0,.6)', borderRadius: 2 }}
        >
          <div className="pos-screen">
            {screen === 'main' && <MainScreen />}
            {screen === 'floor' && <FloorScreen />}
            {screen === 'order' && <OrderScreen />}
            {screen === 'tender' && <TenderScreen />}
            {screen === 'tenderList' && <TenderListScreen />}
            {screen === 'tipAdjust' && <TipAdjustScreen />}
            <DialogHost />
          </div>
        </div>
      </div>
    </div>
  );
}
