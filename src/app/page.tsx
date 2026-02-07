'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { createBoard } from '@/lib/firebase/database';
import { loginAnonymously } from '@/lib/firebase/auth';
import { Loader } from '@/components/ui/Loader';
import { Button } from '@/components/ui/Button';
import styles from './page.module.css';

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Initializing...');

  useEffect(() => {
    async function initializeBoard() {
      if (loading) return;

      try {
        setError(null);
        let userId = user?.id;

        if (!userId) {
          console.log('No user found, logging in anonymously...');
          setStatus('Logging in anonymously...');
          const anonymousUser = await loginAnonymously();
          userId = anonymousUser.user.uid;
          console.log('Anonymous login successful:', userId);
        } else {
          console.log('User already logged in:', userId);
        }

        setStatus('Creating board...');
        console.log('Creating board for user:', userId);
        const boardId = await createBoard(userId);
        console.log('Board created successfully:', boardId);

        setStatus('Redirecting...');
        router.push(`/${boardId}`);
      } catch (error: any) {
        console.error('Error creating board:', error);
        const errorMessage = error?.message || 'Failed to create board';

        if (errorMessage.includes('admin-restricted-operation')) {
          setError('Anonymous authentication is not enabled. Please enable it in Firebase Console: Authentication → Sign-in method → Anonymous');
        } else if (errorMessage.includes('permission')) {
          setError('Database permission denied. Please check your Firebase Realtime Database rules.');
        } else {
          setError(errorMessage);
        }

        setStatus('Error');
      }
    }

    initializeBoard();
  }, [user, loading, router]);

  const handleRetry = () => {
    setError(null);
    setStatus('Retrying...');
    window.location.reload();
  };

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorContainer}>
          <span className={styles.emoji}>❌</span>
          <h2 className={styles.title}>Error Creating Board</h2>
          <p className={styles.message}>{error}</p>
          <div className={styles.buttonGroup}>
            <Button onClick={handleRetry}>Try Again</Button>
            <Button
              variant="secondary"
              onClick={() => window.open('https://console.firebase.google.com', '_blank')}
            >
              Open Firebase Console
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <Loader size="lg" />
        <p className={styles.status}>{status}</p>
      </div>
    </div>
  );
}
