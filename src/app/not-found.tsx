import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <div className={styles.container}>
      <div className={styles.emoji}>🔍</div>
      <h1 className={styles.title}>Board Not Found</h1>
      <p className={styles.message}>
        The board you&apos;re looking for doesn&apos;t exist or has been deleted.
      </p>
      <Link href="/">
        <Button>Create New Board</Button>
      </Link>
    </div>
  );
}
