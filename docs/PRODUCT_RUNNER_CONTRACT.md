# Product Runner Contract

## 목적

`moloco-inspect`의 orchestrator는 요청 흐름과 상태 전이에 집중하고, 실제 product repo/git/worktree 실행은 `product runner` 계약 뒤로 숨깁니다.

이 문서는 preview adapter와 별개로, 실제 제품 저장소를 어떻게 열고 다루는지를 정의합니다.

## runner가 책임지는 것

1. product repo root를 알고 있다
2. inspect branch 이름 충돌을 피한다
3. worktree를 만들고 지운다
4. 로컬 미커밋 변경을 worktree에 동기화한다
5. baseline commit을 만든다
6. changed file를 로컬 repo에 apply 하거나 fallback sync 한다
7. repo 밖 경로로 빠지지 않도록 안전 장치를 둔다

## orchestrator가 runner에 기대하는 것

orchestrator는 아래 정도만 기대하면 됩니다.

- `createWorktree()`
- `syncLocalChangesIntoWorktree()`
- `commitBaseline()`
- `runTypecheck()`
- `runBuild()`
- `runTests()`
- `removeWorktree()`
- `applyPatchToLocalRepo()`
- `syncChangedFilesFromWorktree()`
- `resolveSafeRepoRelativePath()`

즉 orchestrator는 더 이상:

- `git worktree add/remove`
- branch collision handling
- `.omc/apply-backups`
- source repo 기준 file copy/sync

를 직접 구현하지 않는 방향으로 갑니다.

## 최소 interface

```ts
type MTProductRunner = {
  id: string;
  repoRoot: string;
  worktreeBase: string;
  createWorktree(args: {
    requestId: string;
    initialBranch: string;
  }): Promise<{
    branchName: string;
    worktreePath: string;
    baseBranch: string;
  }>;
  syncLocalChangesIntoWorktree(worktreePath: string): Promise<{
    copiedCount: number;
    removedCount: number;
    totalChanged: number;
  }>;
  commitBaseline(worktreePath: string): Promise<boolean>;
  runTypecheck(args: {
    worktreePath: string;
  }): Promise<void>;
  runBuild(args: {
    worktreePath: string;
    client?: string;
    mode?: string;
  }): Promise<void>;
  runTests(args: {
    worktreePath: string;
    filter?: string | null;
    coverage?: boolean;
  }): Promise<void>;
  removeWorktree(worktreePath: string): Promise<void>;
  resolveSafeRepoRelativePath(relativePath: string): {
    normalized: string;
    absolutePath: string;
  };
  syncChangedFilesFromWorktree(args: {
    requestId: string;
    worktreePath: string;
    changedFiles: string[];
    diff?: string | null;
  }): Promise<{
    backupRoot: string;
    appliedFiles: string[];
  }>;
  applyPatchToLocalRepo(args: {
    requestId: string;
    worktreePath: string;
    diff: string;
    changedFiles: string[];
  }): Promise<{
    mode: 'direct_apply' | 'three_way' | 'file_sync';
    backupRoot?: string;
    appliedFiles?: string[];
  }>;
};
```

## preview adapter와의 관계

- `preview adapter`
  - preview bootstrap
  - screenshot
  - route verification
  - copy verification

- `product runner`
  - git repo
  - worktree
  - file sync / local apply
  - repo path safety

둘 다 product-aware layer이지만 책임이 다릅니다.

## 현재 MSM Portal runner가 감싸야 하는 영역

현재 orchestrator 안에서 runner로 옮겨야 하는 책임은 대략 아래입니다.

- branch 존재 여부 확인
- inspect branch 이름 충돌 회피
- worktree 경로 정리
- `git worktree add/remove`
- 로컬 미커밋 변경 동기화
- baseline commit
- local apply fallback (`git apply` → `git apply --3way` → changed file sync)
- `.omc/apply-backups/<request-id>` 백업

## 단계적 이행 원칙

1. 먼저 runner 초안을 만들고 orchestrator가 호출하게 바꾼다
2. 그 다음 source repo 구조를 더 config화한다
3. 마지막에 typecheck/build/test 같은 product CLI도 runner 또는 별도 product execution layer로 분리한다

## 현재 상태

지금은 MSM Portal runner 초안이 추가됐고, 아래 책임은 이미 runner 뒤로 이동했습니다.

- inspect worktree 생성
- local workspace 변경 동기화
- baseline commit
- product typecheck 실행
- product build 실행
- product test 실행
- local apply (`git apply` / `git apply --3way` / changed file sync fallback)
- worktree reset / cleanup

아직 orchestrator에 남아 있는 큰 product-specific 실행 책임은 주로:

- copy namespace 검증에서 source repo 파일을 직접 읽는 부분
- build/test를 어떤 시점과 조건에서 실제로 돌릴지 결정하는 policy
- 일부 repo root 기반 analytics/apply 주변 로직

입니다.
