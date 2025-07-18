export function printHeading(message: string): void {
  console.log(`\x1b[36m${message}\x1b[0m`);
}

export function printMuted(message: string): void {
  console.log(`\x1b[90m${message}\x1b[0m`);
}

export function printStatus(
  message: string,
  status: 'success' | 'warning' | 'error' | 'neutral' = 'neutral',
  details?: string,
): void {
  if (status === 'success') {
    console.log(`\x1b[32m  ✓  \x1b[0m${message}`);
  } else if (status === 'warning') {
    console.log(`\x1b[33m  ⚠  \x1b[0m${message}`);
  } else if (status === 'error') {
    console.log(`\x1b[31m  ✗  \x1b[0m${message}`);
  } else {
    console.log(`\x1b[90m  •  \x1b[0m${message}`);
  }
  if (details) {
    console.log(`\x1b[90m     (${details})\x1b[0m`);
  }
}
