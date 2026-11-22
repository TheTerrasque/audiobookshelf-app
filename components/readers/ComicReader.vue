<template>
  <div id="comic-reader" class="w-full h-full relative">
    <modals-modal v-model="showInfoMenu" height="90%">
      <div class="w-full h-full overflow-hidden absolute top-0 left-0 flex items-center justify-center" @click.stop="showInfoMenu = false">
        <div class="w-full overflow-x-hidden overflow-y-auto bg-bg rounded-lg border border-border text-fg" style="max-height: 75%" @click.stop>
          <div v-for="key in comicMetadataKeys" :key="key" class="w-full px-2 py-1">
            <p class="text-xs">
              <strong>{{ key }}</strong>
              : {{ comicMetadata[key] }}
            </p>
          </div>
        </div>
      </div>
    </modals-modal>

    <div class="overflow-hidden m-auto comicwrapper relative">
      <div class="h-full flex justify-center">
        <img v-if="mainImg" :src="mainImg" class="object-contain comicimg" />
      </div>

      <div v-show="loading" class="w-full h-full absolute top-0 left-0 flex items-center justify-center z-10">
        <ui-loading-indicator />
      </div>
    </div>

    <div class="fixed left-0 h-8 w-full bg-bg px-4 flex items-center text-fg-muted transition-transform" :class="showingToolbar ? 'translate-y-0' : isPlayerOpen ? 'translate-y-[120px]' : 'translate-y-32'" :style="{ bottom: isPlayerOpen ? '120px' : '0px' }">
      <button v-if="hasMultipleFiles" type="button" class="flex items-center min-w-0 text-xs" @click.stop="clickShowFileMenu">
        <span class="material-symbols text-base mr-1">folder_open</span>
        <span class="truncate">{{ currentFileIndex + 1 }} / {{ comicFiles.length }} · {{ currentFileTitle }}</span>
      </button>
      <div class="flex-grow" />
      <p class="text-xs pl-2 whitespace-nowrap">{{ page }} / {{ numPages }}</p>
    </div>

    <modals-dialog v-model="showPageMenu" :items="pageItems" :selected="page" :width="360" item-padding-y="8px" @action="setPage" />
    <modals-dialog v-model="showFileMenu" :items="fileItems" :selected="currentFileIndex" :width="360" item-padding-y="8px" @action="jumpToFile" />
  </div>
</template>

<script>
import Path from 'path'
import { Archive } from 'libarchive.js/main.js'
import { CompressedFile } from 'libarchive.js/src/compressed-file'

Archive.init({
  workerUrl: '/libarchive/worker-bundle.js'
})

/**
 * Comic (cbz/cbr) reader.
 *
 * Two modes:
 * - "server": when reading a server item and the server supports it, pages are fetched one at a time
 *   from GET /api/items/:id/ebook/:fileid?/pages(/:page). The archive is never downloaded as a whole,
 *   and the reader can move between all comic files of the item (e.g. multi-volume books).
 *   Progress is saved with ebookFileIno so it remembers which file it belongs to.
 * - "archive": downloaded (local) items, or servers without the pages endpoint. The whole archive is
 *   loaded and extracted in the webview with libarchive.js (single file only).
 */
export default {
  props: {
    url: String,
    libraryItem: {
      type: Object,
      default: () => {}
    },
    isLocal: Boolean,
    keepProgress: Boolean,
    showingToolbar: Boolean
  },
  data() {
    return {
      loading: false,
      // 'server' | 'archive' | null
      mode: null,
      // Page file names (both modes) - used for the page menu
      pages: null,
      // Server mode: page entries from the manifest
      serverPages: [],
      manifestRevision: null,
      pageImageUrls: Object.create(null),
      // Archive mode
      filesObject: null,
      mainImg: null,
      page: 0,
      numPages: 0,
      showPageMenu: false,
      showInfoMenu: false,
      showFileMenu: false,
      loadTimeout: null,
      loadedFirstPage: false,
      comicMetadata: null,
      pageMenuWidth: 256,
      // Server mode: the comic file currently being read
      currentFileIno: null,
      // 'start' | 'end' | null - which page to land on once the manifest for a file switch loads
      pendingLandOn: null,
      // Bumped on every (re)load so responses for a previous file/item are ignored
      loadId: 0,
      // Server mode: the server answered with a pages manifest at least once for this item
      serverPagesConfirmed: false
    }
  },
  watch: {
    url: {
      immediate: true,
      handler() {
        this.init()
      }
    }
  },
  computed: {
    libraryItemId() {
      return this.libraryItem?.id
    },
    localLibraryItem() {
      if (this.isLocal) return this.libraryItem
      return this.libraryItem.localLibraryItem || null
    },
    localLibraryItemId() {
      return this.localLibraryItem?.id
    },
    serverLibraryItemId() {
      if (!this.isLocal) return this.libraryItem.id
      // Check if local library item is connected to the current server
      if (!this.libraryItem.serverAddress || !this.libraryItem.libraryItemId) return null
      if (this.$store.getters['user/getServerAddress'] === this.libraryItem.serverAddress) {
        return this.libraryItem.libraryItemId
      }
      return null
    },
    isServerMode() {
      return this.mode === 'server'
    },
    // Server mode: all comic files of the item in their configured order
    comicFiles() {
      if (!this.isServerMode) return []
      return (this.libraryItem?.libraryFiles || []).filter((lf) => lf.fileType === 'ebook' && this.isComicFile(lf))
    },
    currentFileIndex() {
      return this.comicFiles.findIndex((lf) => this.sameIno(lf.ino, this.currentFileIno))
    },
    hasMultipleFiles() {
      return this.comicFiles.length > 1 && this.currentFileIndex >= 0
    },
    hasNextFile() {
      return this.currentFileIndex >= 0 && this.currentFileIndex < this.comicFiles.length - 1
    },
    hasPrevFile() {
      return this.currentFileIndex > 0
    },
    currentFileTitle() {
      return this.comicFiles[this.currentFileIndex]?.metadata?.filename || ''
    },
    fileItems() {
      return this.comicFiles.map((lf, index) => ({
        text: lf.metadata?.filename || `File ${index + 1}`,
        value: index
      }))
    },
    primaryEbookFileIno() {
      return this.libraryItem?.media?.ebookFile?.ino ?? null
    },
    // The ino of the file being read, as stored with the server progress
    progressFileIno() {
      if (this.isServerMode) return this.currentFileIno
      return this.$store.state.ereaderFileId || this.primaryEbookFileIno
    },
    ebookBaseUrl() {
      if (!this.serverLibraryItemId) return null
      const baseUrl = `/api/items/${this.serverLibraryItemId}/ebook`
      return this.currentFileIno ? `${baseUrl}/${this.currentFileIno}` : baseUrl
    },
    manifestUrl() {
      return this.ebookBaseUrl ? `${this.ebookBaseUrl}/pages` : null
    },
    comicMetadataKeys() {
      return this.comicMetadata ? Object.keys(this.comicMetadata) : []
    },
    canGoNext() {
      return this.page < this.numPages || this.hasNextFile
    },
    canGoPrev() {
      return this.page > 1 || this.hasPrevFile
    },
    userItemProgress() {
      if (this.isLocal) return this.localItemProgress
      return this.serverItemProgress
    },
    localItemProgress() {
      return this.$store.getters['globals/getLocalMediaProgressById'](this.localLibraryItemId)
    },
    serverItemProgress() {
      return this.$store.getters['user/getUserMediaProgress'](this.serverLibraryItemId)
    },
    // Whether the saved ebookLocation belongs to the file being read. Progress saved before
    // per-file tracking existed (or by an older client) has no ebookFileIno - it belongs to the primary file.
    isSavedProgressForCurrentFile() {
      if (!this.isServerMode) return true
      const savedIno = this.userItemProgress?.ebookFileIno
      if (savedIno) return this.sameIno(savedIno, this.currentFileIno)
      return this.sameIno(this.currentFileIno, this.primaryEbookFileIno)
    },
    savedPage() {
      if (!this.keepProgress) return 0

      // Validate ebookLocation is a number
      if (!this.userItemProgress?.ebookLocation || isNaN(this.userItemProgress.ebookLocation)) return 0
      if (!this.isSavedProgressForCurrentFile) return 0
      return Number(this.userItemProgress.ebookLocation)
    },
    // Progress across all comic files of the item, not just the current one, so that opening the
    // first page of a later volume doesn't reset the book's progress to ~0
    overallEbookProgress() {
      const totalFiles = this.comicFiles.length || 1
      const fileIndex = this.currentFileIndex >= 0 ? this.currentFileIndex : 0
      const withinFileProgress = this.numPages ? (Number(this.page) - 1) / Number(this.numPages) : 0
      return Math.max(0, Math.min(1, (fileIndex + withinFileProgress) / totalFiles))
    },
    selectedCleanedPage() {
      return this.cleanedPageNames[this.page - 1]
    },
    cleanedPageNames() {
      return (
        this.pages?.map((p) => {
          if (p.length > 40) {
            let firstHalf = p.slice(0, 18)
            let lastHalf = p.slice(p.length - 17)
            return `${firstHalf} ... ${lastHalf}`
          }
          return p
        }) || []
      )
    },
    pageItems() {
      let index = 1
      return this.cleanedPageNames.map((p) => {
        return {
          text: p,
          value: index++
        }
      })
    },
    isPlayerOpen() {
      return this.$store.getters['getIsPlayerOpen']
    }
  },
  methods: {
    async updateProgress() {
      if (!this.keepProgress) return

      if (!this.numPages) {
        console.error('Num pages not loaded')
        return
      }
      if (this.savedPage === this.page) {
        return
      }

      const payload = {
        ebookLocation: String(this.page),
        ebookProgress: this.isServerMode ? this.overallEbookProgress : Math.max(0, Math.min(1, (Number(this.page) - 1) / Number(this.numPages)))
      }

      // Update local item. A downloaded comic is the primary ebook file, so only mirror progress
      // for that file into the local progress.
      const isPrimaryFile = !this.isServerMode || this.sameIno(this.currentFileIno, this.primaryEbookFileIno)
      if (this.localLibraryItemId && isPrimaryFile) {
        const localPayload = {
          localLibraryItemId: this.localLibraryItemId,
          ...payload
        }
        const localResponse = await this.$db.updateLocalEbookProgress(localPayload)
        if (localResponse.localMediaProgress) {
          this.$store.commit('globals/updateLocalMediaProgress', localResponse.localMediaProgress)
        }
      }

      // Update server item. ebookFileIno tells the server which file ebookLocation belongs to
      // (servers without per-file progress ignore it).
      if (this.serverLibraryItemId) {
        const serverPayload = {
          ...payload,
          ebookFileIno: this.progressFileIno || null
        }
        this.$nativeHttp.patch(`/api/me/progress/${this.serverLibraryItemId}`, serverPayload).catch((error) => {
          console.error('ComicReader.updateProgress failed:', error)
        })
      }
    },
    clickShowInfoMenu() {
      this.showInfoMenu = !this.showInfoMenu
      this.showPageMenu = false
      this.showFileMenu = false
    },
    clickShowPageMenu() {
      if (!this.numPages) return
      this.showPageMenu = !this.showPageMenu
      this.showInfoMenu = false
      this.showFileMenu = false
    },
    clickShowFileMenu() {
      if (!this.hasMultipleFiles) return
      this.showFileMenu = !this.showFileMenu
      this.showPageMenu = false
      this.showInfoMenu = false
    },
    jumpToFile(index) {
      this.showFileMenu = false
      const file = this.comicFiles[index]
      if (!file || index === this.currentFileIndex) return
      this.switchFile(file.ino, 'start')
    },
    next() {
      // A file is still loading
      if (!this.numPages) return
      if (this.page < this.numPages) {
        this.setPage(this.page + 1)
      } else if (this.hasNextFile) {
        this.switchFile(this.comicFiles[this.currentFileIndex + 1].ino, 'start')
      }
    },
    prev() {
      if (!this.numPages) return
      if (this.page > 1) {
        this.setPage(this.page - 1)
      } else if (this.hasPrevFile) {
        this.switchFile(this.comicFiles[this.currentFileIndex - 1].ino, 'end')
      }
    },
    setPage(page) {
      if (page <= 0 || page > this.numPages) {
        return
      }
      this.showPageMenu = false
      this.page = page

      this.updateProgress()
      if (this.isServerMode) {
        this.preloadServerPage(page + 1)
        return this.displayServerPage(page)
      }
      const filename = this.pages[page - 1]
      return this.extractFile(filename)
    },
    setLoadTimeout() {
      this.clearLoadTimeout()
      this.loadTimeout = setTimeout(() => {
        this.loading = true
      }, 150)
    },
    clearLoadTimeout() {
      if (this.loadTimeout) {
        clearTimeout(this.loadTimeout)
        this.loadTimeout = null
      }
    },
    isComicFile(libraryFile) {
      let ext = (libraryFile?.metadata?.ext || '').toLowerCase()
      if (!ext) ext = (Path.extname(libraryFile?.metadata?.path || '') || '').toLowerCase()
      return ext === '.cbz' || ext === '.cbr'
    },
    sameIno(a, b) {
      return a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b)
    },
    resetState() {
      this.loadId++
      this.mode = null
      this.serverPagesConfirmed = false
      this.pages = null
      this.serverPages = []
      this.manifestRevision = null
      this.filesObject = null
      this.mainImg = null
      this.page = 0
      this.numPages = 0
      this.showPageMenu = false
      this.showInfoMenu = false
      this.showFileMenu = false
      this.loadedFirstPage = false
      this.comicMetadata = null
      this.clearPageImageUrls()
      this.clearLoadTimeout()
      this.loading = false
    },
    async init() {
      this.resetState()
      if (!this.url) return

      // Server-side pages need a server item; downloaded items are read from the local file
      if (!this.isLocal && this.serverLibraryItemId) {
        this.mode = 'server'
        this.currentFileIno = this.resolveInitialFileIno()
        this.pendingLandOn = null
        const loaded = await this.loadManifest()
        if (loaded !== 'unsupported') return
        // Server does not have the pages endpoint (older server) - fall back to the whole archive
        console.warn('[ComicReader] Server does not support comic pages endpoint, extracting archive in app')
        this.resetState()
      }
      this.mode = 'archive'
      this.extract()
    },
    resolveInitialFileIno() {
      // A specific (supplementary) file was opened
      if (this.$store.state.ereaderFileId) return this.$store.state.ereaderFileId
      // Otherwise continue in the file the saved progress belongs to, if it is still a comic file of this item
      if (this.keepProgress) {
        const savedIno = this.serverItemProgress?.ebookFileIno
        const isComicFileOfItem = (this.libraryItem?.libraryFiles || []).some((lf) => lf.fileType === 'ebook' && this.isComicFile(lf) && this.sameIno(lf.ino, savedIno))
        if (savedIno && isComicFileOfItem) return savedIno
      }
      return this.primaryEbookFileIno
    },
    switchFile(ino, landOn) {
      this.showPageMenu = false
      this.showInfoMenu = false
      this.showFileMenu = false
      this.loadId++
      this.clearPageImageUrls()
      this.mainImg = null
      // Forget the previous file's pages so nothing pages through them against the new file while it loads
      this.pages = null
      this.serverPages = []
      this.page = 0
      this.numPages = 0
      this.pendingLandOn = landOn
      this.currentFileIno = ino
      this.loadManifest()
    },
    /**
     * Server mode: load the page manifest for the current file
     * @returns {Promise<'ok'|'error'|'unsupported'|'stale'>}
     */
    async loadManifest() {
      const loadId = this.loadId
      const manifestUrl = this.manifestUrl
      if (!manifestUrl) return 'unsupported'
      this.loading = true
      try {
        const manifest = await this.$axios.$get(manifestUrl)
        if (loadId !== this.loadId) return 'stale'
        if (!manifest || !Array.isArray(manifest.pages)) {
          // Not a pages manifest (e.g. an older server returning something else)
          this.loading = false
          return 'unsupported'
        }

        this.serverPagesConfirmed = true
        this.serverPages = manifest.pages
        this.pages =manifest.pages.map((p) => p.displayName || p.name || p.path || '')
        this.numPages = manifest.pageCount || manifest.pages.length
        this.manifestRevision = manifest.revision || null
        this.comicMetadata = manifest.metadata || null
        this.calculatePageMenuWidth()
        this.loading = false

        if (!this.numPages) {
          this.$toast.error('Unable to extract pages')
          return 'error'
        }

        let startPage
        if (this.pendingLandOn === 'end') startPage = this.numPages
        else if (this.pendingLandOn === 'start') startPage = 1
        else startPage = this.savedPage > 0 && this.savedPage <= this.numPages ? this.savedPage : 1
        this.pendingLandOn = null

        await this.setPage(startPage)
        this.loadedFirstPage = true
        this.$emit('loaded', {
          hasMetadata: !!this.comicMetadata
        })
        return 'ok'
      } catch (error) {
        if (loadId !== this.loadId) return 'stale'
        this.loading = false
        const status = error?.response?.status
        // Older servers: /ebook/pages hits the plain ebook route (400) and /ebook/:ino/pages has no route (404)
        if (!this.serverPagesConfirmed && (status === 400 || status === 404)) {
          return 'unsupported'
        }
        console.error('[ComicReader] Failed to load comic pages', error)
        this.$toast.error('Failed to load comic pages')
        return 'error'
      }
    },
    buildPageImageUrl(pageNumber) {
      if (!this.ebookBaseUrl) return null
      const versionQuery = this.manifestRevision ? `?v=${this.manifestRevision}` : ''
      return `${this.ebookBaseUrl}/pages/${pageNumber}${versionQuery}`
    },
    async fetchServerPage(pageNumber) {
      const cachedUrl = this.pageImageUrls[pageNumber]
      if (cachedUrl) return cachedUrl
      const loadId = this.loadId
      const url = this.buildPageImageUrl(pageNumber)
      if (!url) return null
      const blob = await this.$axios.$get(url, { responseType: 'blob' })
      // The reader moved to another file/item while loading - don't cache this page for it
      if (loadId !== this.loadId) return null
      if (this.pageImageUrls[pageNumber]) return this.pageImageUrls[pageNumber]
      const objectUrl = URL.createObjectURL(blob)
      this.pageImageUrls[pageNumber] = objectUrl
      return objectUrl
    },
    async displayServerPage(pageNumber) {
      const loadId = this.loadId
      if (!this.pageImageUrls[pageNumber]) this.setLoadTimeout()
      try {
        const objectUrl = await this.fetchServerPage(pageNumber)
        if (loadId !== this.loadId || this.page !== pageNumber || !objectUrl) return
        this.mainImg = objectUrl
      } catch (error) {
        if (loadId !== this.loadId || this.page !== pageNumber) return
        console.error(`[ComicReader] Failed to load page ${pageNumber}`, error)
        this.$toast.error('Read page file failed')
      } finally {
        if (loadId === this.loadId && this.page === pageNumber) {
          this.clearLoadTimeout()
          this.loading = false
        }
      }
    },
    async preloadServerPage(pageNumber) {
      if (pageNumber <= 0 || pageNumber > this.numPages || this.pageImageUrls[pageNumber]) return
      try {
        await this.fetchServerPage(pageNumber)
      } catch (error) {
        console.warn(`[ComicReader] Failed to preload page ${pageNumber}`, error)
      }
    },
    clearPageImageUrls() {
      Object.values(this.pageImageUrls).forEach((url) => URL.revokeObjectURL(url))
      this.pageImageUrls = Object.create(null)
    },
    calculatePageMenuWidth() {
      const largestFilename = this.cleanedPageNames
        .map((p) => p)
        .sort((a, b) => a.length - b.length)
        .pop()
      if (!largestFilename) return
      const pEl = document.createElement('p')
      pEl.innerText = largestFilename
      pEl.style.fontSize = '0.875rem'
      pEl.style.opacity = 0
      pEl.style.position = 'absolute'
      document.body.appendChild(pEl)
      const textWidth = pEl.getBoundingClientRect()?.width
      if (textWidth) {
        this.pageMenuWidth = textWidth + (16 + 5 + 2 + 5)
      }
      pEl.remove()
    },
    extractFile(filename) {
      return new Promise(async (resolve) => {
        this.setLoadTimeout()
        var file = await this.filesObject[filename].extract()
        var reader = new FileReader()
        reader.onload = (e) => {
          this.mainImg = e.target.result
          this.loading = false
          resolve()
        }
        reader.onerror = (e) => {
          console.error(e)
          this.$toast.error('Read page file failed')
          this.loading = false
          resolve()
        }
        reader.readAsDataURL(file)
        this.clearLoadTimeout()
      })
    },
    async extract() {
      const loadId = this.loadId
      this.loading = true

      let buff
      try {
        buff = await this.$axios.$get(this.url, {
          responseType: 'blob'
        })
      } catch (error) {
        if (loadId !== this.loadId) return
        console.error('[ComicReader] Failed to download comic', error)
        this.$toast.error('Unable to extract pages')
        this.loading = false
        return
      }
      if (loadId !== this.loadId) return

      const archive = await Archive.open(buff)
      const originalFilesObject = await archive.getFilesObject()
      if (loadId !== this.loadId) return
      // to support images in subfolders we need to flatten the object
      //   ref: https://github.com/advplyr/audiobookshelf/issues/811
      this.filesObject = this.flattenFilesObject(originalFilesObject)
      console.log('Extracted files object', this.filesObject)
      var filenames = Object.keys(this.filesObject)
      this.parseFilenames(filenames)

      var xmlFile = filenames.find((f) => (Path.extname(f) || '').toLowerCase() === '.xml')
      if (xmlFile) await this.extractXmlFile(xmlFile)

      this.numPages = this.pages.length
      this.calculatePageMenuWidth()

      if (this.pages.length) {
        this.loading = false

        const startPage = this.savedPage > 0 && this.savedPage <= this.numPages ? this.savedPage : 1
        await this.setPage(startPage)
        this.loadedFirstPage = true

        this.$emit('loaded', {
          hasMetadata: this.comicMetadata
        })
      } else {
        this.$toast.error('Unable to extract pages')
        this.loading = false
      }
    },
    flattenFilesObject(filesObject) {
      const flattenObject = (obj, prefix = '') => {
        var _obj = {}
        for (const key in obj) {
          const newKey = prefix ? prefix + '/' + key : key
          if (obj[key] instanceof CompressedFile) {
            _obj[newKey] = obj[key]
          } else if (!key.startsWith('_') && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
            _obj = {
              ..._obj,
              ...flattenObject(obj[key], newKey)
            }
          } else {
            _obj[newKey] = obj[key]
          }
        }
        return _obj
      }
      return flattenObject(filesObject)
    },
    async extractXmlFile(filename) {
      try {
        var file = await this.filesObject[filename].extract()
        var reader = new FileReader()
        reader.onload = (e) => {
          this.comicMetadata = this.$xmlToJson(e.target.result)
          console.log('Metadata', this.comicMetadata)
        }
        reader.onerror = (e) => {
          console.error(e)
        }
        reader.readAsText(file)
      } catch (error) {
        console.error(error)
      }
    },
    parseImageFilename(filename) {
      var basename = Path.basename(filename, Path.extname(filename))
      var numbersinpath = basename.match(/\d+/g)
      if (!numbersinpath?.length) {
        return {
          index: -1,
          filename
        }
      } else {
        return {
          index: Number(numbersinpath[numbersinpath.length - 1]),
          filename
        }
      }
    },
    parseFilenames(filenames) {
      const acceptableImages = ['.jpeg', '.jpg', '.png', '.webp']
      var imageFiles = filenames.filter((f) => {
        return acceptableImages.includes((Path.extname(f) || '').toLowerCase())
      })
      var imageFileObjs = imageFiles.map((img) => {
        return this.parseImageFilename(img)
      })

      var imagesWithNum = imageFileObjs.filter((i) => i.index >= 0)
      var orderedImages = imagesWithNum.sort((a, b) => a.index - b.index).map((i) => i.filename)
      var noNumImages = imageFileObjs.filter((i) => i.index < 0)
      orderedImages = orderedImages.concat(noNumImages.map((i) => i.filename))

      this.pages = orderedImages
    }
  },
  mounted() {},
  beforeDestroy() {
    this.loadId++
    this.clearLoadTimeout()
    this.clearPageImageUrls()
  }
}
</script>

<style scoped>
#comic-reader {
  height: 100%;
  max-height: 100%;
}
.reader-player-open #comic-reader {
  height: calc(100% - 120px);
  max-height: calc(100% - 120px);
}

.comicimg {
  height: 100%;
  margin: auto;
}
.comicwrapper {
  width: 100vw;
  height: 100%;
}
</style>
