import { execSync } from "child_process";

export function getGitDiff() {
  try {
    return execSync("git diff --unified=0", { encoding: "utf-8" });
  } catch (error) {
    console.error("执行 Git 命令失败:", error.message);
    return "";
  }
}

const diff = getGitDiff();

console.log(diff);
