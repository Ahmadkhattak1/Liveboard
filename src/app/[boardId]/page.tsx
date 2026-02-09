'use client';

import Link from 'next/link';
import { BoardProvider } from '@/components/providers/BoardProvider';
import { useBoard } from '@/components/providers/BoardProvider';
import { CanvasProvider } from '@/components/canvas/CanvasProvider';
import { Canvas } from '@/components/canvas/Canvas';
import { Toolbar } from '@/components/toolbar/Toolbar';
import { Loader } from '@/components/ui/Loader';

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
        <BoardView />
      </CanvasProvider>
    </BoardProvider>
  );
}

function BoardView() {
  const { loading, error } = useBoard();

  if (loading) {
    return (
      <div className={styles.statusScreen}>
        <div className={styles.statusCard}>
          <Loader size="lg" />
          <p className={styles.statusText}>Loading board...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.statusScreen}>
        <div className={styles.statusCard}>
          <h1 className={styles.statusTitle}>Unable to open board</h1>
          <p className={styles.statusText}>{error}</p>
          <Link href="/" className={styles.statusLink}>
            Go to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Toolbar />
      <main className={styles.main}>
        <Canvas />
      </main>
    </div>
  );
}
