import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';

export default function Index() {
  const { session } = useAuth();
  if (session === undefined) return null;
  if (!session) return <Redirect href="/welcome" />;
  // parents and read-only viewers (tutors) share the parent tabs; viewers see them without editing
  return <Redirect href={session.role === 'child' ? '/child' : '/parent'} />;
}
