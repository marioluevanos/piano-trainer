import type { User } from "firebase/auth";
import { Button } from "../../components/Button/Button";
import { Menu } from "../../components/Menu/Menu";
import "./HomeHeader.css";

interface Props {
  user: User | null;
  /** While the library loads, the account controls are held back. */
  loading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  /** Opens the practice activity page. */
  onOpenActivity: () => void;
}

/** The top bar: the logo and the account. */
export function HomeHeader({
  user,
  loading,
  onSignIn,
  onSignOut,
  onOpenActivity,
}: Props) {
  const name = user?.displayName?.trim() || user?.email || "";
  return (
    <header className="home-header">
      <h1 className="home-logo">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
        <span className="visually-hidden">Piano Trainer</span>
      </h1>
      {!loading && (
        <div className="home-account">
          {user ? (
            <Menu
              label="Account"
              button={{
                variant: "primary",
                icon: true,
                round: true,
                "aria-label": `Account: ${name}`,
                title: name,
                children: [...name][0]?.toUpperCase() ?? "?",
              }}
              heading={
                <>
                  <span className="account-name">{name}</span>
                  {user.email && user.email !== name && (
                    <span className="account-email">{user.email}</span>
                  )}
                </>
              }
              items={[
                { label: "Practice activity", onSelect: onOpenActivity },
                {
                  label: "Sign out",
                  onSelect: onSignOut,
                  title: "Your songs stay in your account",
                },
              ]}
            />
          ) : (
            <Button
              onClick={onSignIn}
              title="Keep the songs you load in your Google account, on every device"
            >
              Sign in
            </Button>
          )}
        </div>
      )}
    </header>
  );
}
