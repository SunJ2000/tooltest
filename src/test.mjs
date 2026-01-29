import { execSync } from "child_process";

export function getGitDiff() {
  return execSync("git diff --unified=0", { encoding: "utf-8" });
}

const diff = getGitDiff();

console.log(diff);
