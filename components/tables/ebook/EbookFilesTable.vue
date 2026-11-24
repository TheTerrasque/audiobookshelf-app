<template>
  <div class="w-full my-2">
    <div class="w-full bg-primary px-4 py-2 flex items-center" :class="showFiles ? 'rounded-t-md' : 'rounded-md'" @click.stop="clickBar">
      <p class="pr-2">{{ $strings.HeaderEbookFiles }}</p>
      <div class="h-6 w-6 rounded-full bg-fg/10 flex items-center justify-center">
        <span class="text-xs font-mono">{{ ebookFiles.length }}</span>
      </div>
      <div class="flex-grow" />
      <ui-btn v-if="canReorder && !reordering" small class="mr-2" @click.stop="startReorder">{{ $strings.ButtonReorder }}</ui-btn>
      <div class="h-10 w-10 rounded-full flex justify-center items-center duration-500" :class="showFiles ? 'transform rotate-180' : ''">
        <span class="material-symbols text-3xl">arrow_drop_down</span>
      </div>
    </div>
    <transition name="slide">
      <div class="w-full" v-show="showFiles">
        <!-- Fork: reorder ebook files (PATCH /api/items/:id/ebook on the server fork) -->
        <div v-if="reordering" class="w-full">
          <p class="text-xs text-fg-muted px-4 py-2">{{ $strings.MessageReorderEbookFilesHelp }}</p>
          <table class="text-sm tracksTable">
            <tr v-for="(file, index) in reorderFiles" :key="file.ino">
              <td class="px-4 break-all">{{ file.metadata.filename }}</td>
              <td class="w-24 pr-2">
                <div class="flex items-center justify-end">
                  <ui-icon-btn icon="arrow_upward" borderless :aria-label="$strings.ButtonMoveUp" :disabled="index === 0 || savingOrder" @click="moveFile(index, -1)" />
                  <ui-icon-btn icon="arrow_downward" borderless :aria-label="$strings.ButtonMoveDown" :disabled="index === reorderFiles.length - 1 || savingOrder" @click="moveFile(index, 1)" />
                </div>
              </td>
            </tr>
          </table>
          <div class="flex items-center justify-end px-4 py-3 space-x-2">
            <ui-btn small :disabled="savingOrder" @click="cancelReorder">{{ $strings.ButtonCancel }}</ui-btn>
            <ui-btn small color="bg-success" :loading="savingOrder" :disabled="!orderChanged" @click="saveOrder">{{ $strings.ButtonSaveOrder }}</ui-btn>
          </div>
        </div>
        <table v-else class="text-sm tracksTable">
          <tr>
            <th class="text-left px-4">{{ $strings.LabelFilename }}</th>
            <th class="text-left px-4 w-16">{{ $strings.LabelRead }}</th>
            <th v-if="userCanUpdate && !libraryIsAudiobooksOnly" class="text-center w-16"></th>
          </tr>
          <template v-for="file in ebookFiles">
            <tables-ebook-files-table-row :key="file.path" :libraryItemId="libraryItemId" :file="file" @read="readEbook" @more="showMore" />
          </template>
        </table>
      </div>
    </transition>

    <modals-dialog v-model="showMoreMenu" :items="moreMenuItems" @action="moreMenuAction" />
  </div>
</template>

<script>
export default {
  props: {
    libraryItem: {
      type: Object,
      default: () => {}
    }
  },
  data() {
    return {
      processing: false,
      showFiles: false,
      showMoreMenu: false,
      moreMenuItems: [],
      selectedFile: null,
      reordering: false,
      savingOrder: false,
      reorderFiles: []
    }
  },
  computed: {
    libraryItemId() {
      return this.libraryItem.id
    },
    ebookFiles() {
      return (this.libraryItem.libraryFiles || []).filter((lf) => lf.fileType === 'ebook')
    },
    userCanUpdate() {
      return this.$store.getters['user/getUserCanUpdate']
    },
    libraryIsAudiobooksOnly() {
      return this.$store.getters['libraries/getLibraryIsAudiobooksOnly']
    },
    canReorder() {
      // Server items only (not downloaded copies), and only with something to order
      return this.userCanUpdate && !this.libraryIsAudiobooksOnly && !this.libraryItem.isLocal && this.ebookFiles.length > 1
    },
    orderChanged() {
      return this.reorderFiles.some((file, index) => file.ino !== this.ebookFiles[index]?.ino)
    }
  },
  methods: {
    startReorder() {
      this.reorderFiles = this.ebookFiles.slice()
      this.reordering = true
      this.showFiles = true
    },
    cancelReorder() {
      this.reordering = false
      this.reorderFiles = []
    },
    moveFile(index, direction) {
      const target = index + direction
      if (target < 0 || target >= this.reorderFiles.length) return
      const files = this.reorderFiles.slice()
      ;[files[index], files[target]] = [files[target], files[index]]
      this.reorderFiles = files
    },
    async saveOrder() {
      const orderedFileData = this.reorderFiles.map((file) => ({ ino: file.ino }))
      this.savingOrder = true
      try {
        const updatedItem = await this.$nativeHttp.patch(`/api/items/${this.libraryItemId}/ebook`, { orderedFileData })
        this.$toast.success(this.$strings.ToastEbookOrderUpdated)
        this.reordering = false
        this.reorderFiles = []
        if (updatedItem?.id) this.$emit('updated', updatedItem)
      } catch (error) {
        console.error('Failed to update ebook order', error)
        this.$toast.error(this.$strings.ToastEbookOrderUpdateFailed)
      } finally {
        this.savingOrder = false
      }
    },
    moreMenuAction(action) {
      this.showMoreMenu = false
      if (action === 'updateStatus') {
        this.updateEbookStatus()
      }
    },
    showMore({ file, items }) {
      this.showMoreMenu = true
      this.selectedFile = file
      this.moreMenuItems = items
    },
    readEbook(fileIno) {
      this.$store.commit('showReader', { libraryItem: this.libraryItem, keepProgress: false, fileId: fileIno })
    },
    clickBar() {
      this.showFiles = !this.showFiles
    },
    updateEbookStatus() {
      this.processing = true
      this.$nativeHttp
        .patch(`/api/items/${this.libraryItemId}/ebook/${this.selectedFile.ino}/status`)
        .then(() => {
          this.$toast.success('Ebook updated')
        })
        .catch((error) => {
          console.error('Failed to update ebook', error)
          this.$toast.error('Failed to update ebook')
        })
        .finally(() => {
          this.processing = false
        })
    }
  },
  mounted() {}
}
</script>
