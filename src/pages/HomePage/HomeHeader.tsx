import type { User } from "firebase/auth";
import { Button } from "../../components/Button/Button";
import "./HomeHeader.css";

interface Props {
  user: User | null;
  /** While the library loads, the account controls are held back. */
  loading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

/** The top bar: the logo and the account. */
export function HomeHeader({ user, loading, onSignIn, onSignOut }: Props) {
  return (
    <header className="home-header">
      <h1 className="home-logo">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
        <span className="visually-hidden">Piano Trainer</span>
      </h1>
      {!loading && (
        <div className="home-account">
          {user ? (
            <>
              <span className="account">{user.displayName ?? user.email}</span>
              <Button
                onClick={onSignOut}
                title="Your songs stay in your account"
              >
                Sign out
              </Button>
            </>
          ) : (
            <Button
              onClick={onSignIn}
              title="Keep the songs you load in your Google account, on every device"
            >
              Sign in to sync songs
            </Button>
          )}
        </div>
      )}
    </header>
  );
}
