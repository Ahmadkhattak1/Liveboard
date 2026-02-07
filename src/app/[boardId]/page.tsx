'use client';

import { BoardProvider } from '@/components/providers/BoardProvider';
import { CanvasProvider } from '@/components/canvas/CanvasProvider';
import { Canvas } from '@/components/canvas/Canvas';
import { Toolbar } from '@/components/toolbar/Toolbar';

import styles from './page.module.css';

export default function BoardPage({
  params,
}: {
  params: { boardId: string };
}) {
  const { boardId } = params;

  return (
    <BoardProvider boardId={boardId}>
      <CanvasProvider>
        <BoardView boardId={boardId} />
      </CanvasProvider>
    </BoardProvider>
  );
}

function BoardView({ boardId }: { boardId: string }) {
  return (
    <div className={styles.page}>


      {/* Toolbar */}
      <Toolbar />

      {/* Canvas */}
      <main className={styles.main}>
        <Canvas />
      </main>
    </div>
  );
}
