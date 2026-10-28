import { Clock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Modal } from './ui';

export default function SessionExpiredDialog() {
  const { sessionExpired, continueSession, signOut } = useAuth();
  return (
    <Modal
      open={sessionExpired}
      dismissible={false}
      icon={Clock}
      title="Session expired"
      description="For your security Google access tokens expire after an hour. Continue to pick up right where you left off; anything in progress will resume."
      footer={
        <>
          <button className="btn-ghost" onClick={signOut}>
            Sign out
          </button>
          <button className="btn-primary" onClick={continueSession} data-autofocus>
            Continue
          </button>
        </>
      }
    />
  );
}
