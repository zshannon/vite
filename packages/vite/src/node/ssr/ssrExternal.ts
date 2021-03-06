import fs from 'fs'
import path from 'path'
import { tryNodeResolve, InternalResolveOptions } from '../plugins/resolve'
import { lookupFile, resolveFrom } from '../utils'
import { ResolvedConfig } from '..'

/**
 * Heuristics for determining whether a dependency should be externalized for
 * server-side rendering.
 *
 * TODO right now externals are imported using require(), we probably need to
 * rework this when more libraries ship native ESM distributions for Node.
 */
export function resolveSSRExternal(
  config: ResolvedConfig,
  knownImports: string[],
  ssrExternals: Set<string> = new Set()
): string[] {
  const { root } = config
  const pkgContent = lookupFile(root, ['package.json'])
  if (!pkgContent) {
    return []
  }
  const pkg = JSON.parse(pkgContent)
  const devDeps = Object.keys(pkg.devDependencies || {})
  const deps = [...knownImports, ...Object.keys(pkg.dependencies || {})]

  for (const id of devDeps) {
    ssrExternals.add(id)
  }

  const resolveOptions: InternalResolveOptions = {
    root,
    isProduction: false,
    isBuild: true
  }

  for (const id of deps) {
    let entry
    let requireEntry
    try {
      entry = tryNodeResolve(id, undefined, resolveOptions)?.id
      requireEntry = require.resolve(id, { paths: [root] })
    } catch (e) {
      // resolve failed, assume include
      continue
    }
    if (!entry) {
      // no esm entry but has require entry (is this even possible?)
      ssrExternals.add(id)
      continue
    }
    if (!entry.includes('node_modules')) {
      // entry is not a node dep, possibly linked - don't externalize
      // instead, trace its dependencies.
      const depRoot = path.dirname(resolveFrom(`${id}/package.json`, root))
      resolveSSRExternal(
        {
          ...config,
          root: depRoot
        },
        knownImports,
        ssrExternals
      )
      continue
    }
    if (entry !== requireEntry) {
      // has separate esm/require entry, assume require entry is cjs
      ssrExternals.add(id)
    } else {
      // node resolve and esm resolve resolves to the same file.
      if (!/\.m?js$/.test(entry)) {
        // entry is not js, cannot externalize
        continue
      }
      // check if the entry is cjs
      const content = fs.readFileSync(entry, 'utf-8')
      if (/\bmodule\.exports\b|\bexports[.\[]|\brequire\s*\(/.test(content)) {
        ssrExternals.add(id)
      }
    }
  }

  if (config.ssr?.external) {
    config.ssr.external.forEach((id) => ssrExternals.add(id))
  }
  let externals = [...ssrExternals]
  if (config.ssr?.noExternal) {
    externals = externals.filter((id) => !config.ssr!.noExternal!.includes(id))
  }
  return externals.filter((id) => id !== 'vite')
}

export function shouldExternalizeForSSR(
  id: string,
  externals: string[]
): boolean {
  const should = externals.some((e) => {
    if (id === e) {
      return true
    }
    // deep imports, check ext before externalizing - only externalize
    // extension-less imports and explicit .js imports
    if (id.startsWith(e + '/') && (!path.extname(id) || id.endsWith('.js'))) {
      return true
    }
  })
  return should
}
