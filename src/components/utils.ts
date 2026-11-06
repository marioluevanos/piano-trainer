type Value = string | number | boolean | undefined | null;
type Mapping = Record<string, unknown>;
type ArgumentArray = Array<Argument>;
type Argument = Value | Mapping | ArgumentArray;

/**
 * A simple JavaScript utility for conditionally joining cn together.
 */
export function cn(...args: ArgumentArray): string;

export function cn(...args: ArgumentArray): string {
  const classes = [];
  const hasOwn = {}.hasOwnProperty;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    const argType = typeof arg;

    if (argType === "string" || argType === "number") {
      classes.push(arg);
    } else if (Array.isArray(arg)) {
      if (arg.length) {
        const inner = cn(...arg);
        if (inner) {
          classes.push(inner);
        }
      }
    } else if (argType === "object") {
      if (
        typeof arg === "object" &&
        arg.toString === Object.prototype.toString
      ) {
        for (const key in arg) {
          if (hasOwn.call(arg, key) && arg[key]) {
            classes.push(key);
          }
        }
      } else {
        classes.push(arg.toString());
      }
    }
  }

  return classes.join(" ");
}
