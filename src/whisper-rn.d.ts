// whisper.rn's package.json "exports" map only defines subpaths ("./*"), not the
// bare "whisper.rn" entry, so TypeScript (bundler resolution) cannot find it.
// Its types do resolve through the "./index" subpath; re-export them here.
declare module 'whisper.rn' {
  export * from 'whisper.rn/index';
}
