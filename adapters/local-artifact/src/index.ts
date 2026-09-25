import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ArtifactTargetSchema, type ActionRecord } from '@lumi/contracts'

export interface ArtifactObservation {
  artifactRef: string
  contentDigest: string | null
  exists: boolean
}

export interface ArtifactWriteResult {
  artifactRef: string
  contentDigest: string
  providerVersion: string
}

export interface ArtifactProvider {
  read(action: ActionRecord): Promise<ArtifactObservation>
  write(action: ActionRecord, content: string): Promise<ArtifactWriteResult>
}

export class ArtifactBoundaryError extends Error {
  constructor(
    readonly code: 'CONFLICT' | 'INVALID_INPUT',
    message: string,
  ) {
    super(message)
    this.name = 'ArtifactBoundaryError'
  }
}

export class LocalArtifactProvider implements ArtifactProvider {
  readonly #configuredRoot: string

  constructor(root: string) {
    this.#configuredRoot = resolve(root)
  }

  async write(action: ActionRecord, content: string): Promise<ArtifactWriteResult> {
    const expectedDigest = digest(content)
    if (expectedDigest !== action.inputDigest) {
      throw new ArtifactBoundaryError('INVALID_INPUT', 'Artifact content digest changed')
    }
    const root = await this.#ensureRoot()
    const targetPath = this.#targetPath(root, action)
    const temporaryPath = join(root, `.lumi-${randomUUID()}.tmp`)
    let temporaryCreated = false
    try {
      const handle = await open(
        temporaryPath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      )
      temporaryCreated = true
      try {
        await handle.writeFile(content, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      try {
        await link(temporaryPath, targetPath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new ArtifactBoundaryError('CONFLICT', 'Artifact target already exists')
        }
        throw error
      }
      return {
        artifactRef: pathToFileURL(targetPath).href,
        contentDigest: expectedDigest,
        providerVersion: 'local-artifact/1',
      }
    } finally {
      if (temporaryCreated) {
        await unlink(temporaryPath).catch(() => undefined)
      }
    }
  }

  async read(action: ActionRecord): Promise<ArtifactObservation> {
    const root = await this.#ensureRoot()
    const targetPath = this.#targetPath(root, action)
    let handle
    try {
      handle = await open(targetPath, constants.O_RDONLY | constants.O_NOFOLLOW)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          artifactRef: pathToFileURL(targetPath).href,
          contentDigest: null,
          exists: false,
        }
      }
      throw error
    }
    try {
      const stat = await handle.stat()
      if (!stat.isFile()) {
        throw new ArtifactBoundaryError('INVALID_INPUT', 'Artifact target is not a regular file')
      }
      const content = await handle.readFile()
      return {
        artifactRef: pathToFileURL(targetPath).href,
        contentDigest: digest(content),
        exists: true,
      }
    } finally {
      await handle.close()
    }
  }

  async #ensureRoot(): Promise<string> {
    await mkdir(this.#configuredRoot, { mode: 0o700, recursive: true })
    const stat = await lstat(this.#configuredRoot)
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new ArtifactBoundaryError('INVALID_INPUT', 'Artifact root must be a real directory')
    }
    return realpath(this.#configuredRoot)
  }

  #targetPath(root: string, action: ActionRecord): string {
    const target = ArtifactTargetSchema.parse(action.target)
    const actionKey = createHash('sha256').update(action.id, 'utf8').digest('hex').slice(0, 16)
    return join(root, `${target.artifactId}.${actionKey}.artifact`)
  }
}

function digest(content: string | Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}
