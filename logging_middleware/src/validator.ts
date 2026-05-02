import { Stack, Level, Package } from "./types";
import { VALID_STACKS, VALID_LEVELS, VALID_PACKAGES, BACKEND_PACKAGES, FRONTEND_PACKAGES } from "./constants";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateLogParams(
  stack: string,
  level: string,
  pkg: string,
  message: string
): ValidationResult {
  const errors: string[] = [];

  if (!VALID_STACKS.has(stack as Stack)) {
    errors.push(`Invalid stack "${stack}". Allowed: ${[...VALID_STACKS].join(", ")}`);
  }

  if (!VALID_LEVELS.has(level as Level)) {
    errors.push(`Invalid level "${level}". Allowed: ${[...VALID_LEVELS].join(", ")}`);
  }

  if (!VALID_PACKAGES.has(pkg as Package)) {
    errors.push(`Invalid package "${pkg}". Allowed: ${[...VALID_PACKAGES].join(", ")}`);
  } else {
    if (stack === "frontend" && BACKEND_PACKAGES.has(pkg)) {
      errors.push(`Package "${pkg}" is only valid for stack="backend".`);
    }
    if (stack === "backend" && FRONTEND_PACKAGES.has(pkg)) {
      errors.push(`Package "${pkg}" is only valid for stack="frontend".`);
    }
  }

  if (typeof message !== "string" || message.trim().length === 0) {
    errors.push("Log message must be a non-empty string.");
  }

  return { valid: errors.length === 0, errors };
}
