import chalk from "chalk";

export const symbols = {
  success: chalk.green("✔"),
  error: chalk.red("✖"),
  warning: chalk.yellow("⚠"),
  info: chalk.blue("ℹ"),
  arrow: chalk.cyan("→"),
  bullet: chalk.dim("•"),
};

export function heading(text: string): string {
  return chalk.bold(text);
}

export function label(key: string, value: string): string {
  return `  ${chalk.dim(key + ":")}  ${value}`;
}

export function statusColor(status: string): string {
  switch (status.toUpperCase()) {
    case "STABLE":
      return chalk.green(status);
    case "IN_PROGRESS":
      return chalk.yellow(status);
    case "BLOCKED":
      return chalk.red(status);
    default:
      return status;
  }
}

export function success(message: string): void {
  console.log(`${symbols.success} ${message}`);
}

export function error(message: string): void {
  console.error(`${symbols.error} ${chalk.red(message)}`);
}

export function warn(message: string): void {
  console.log(`${symbols.warning} ${chalk.yellow(message)}`);
}

export function info(message: string): void {
  console.log(`${symbols.info} ${message}`);
}

export function dim(text: string): string {
  return chalk.dim(text);
}

export function bold(text: string): string {
  return chalk.bold(text);
}

export function divider(): void {
  console.log(chalk.dim("─".repeat(50)));
}
