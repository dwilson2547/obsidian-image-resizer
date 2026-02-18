import { Notice, Plugin, TFile, Menu, Editor } from "obsidian";
import {
  ImageResizerSettings,
  DEFAULT_SETTINGS,
  ImageResizerSettingTab,
} from "./settings";
import { isImageFile, resizeImage, getExtension } from "./resizer";

export default class ImageResizerPlugin extends Plugin {
  settings: ImageResizerSettings = DEFAULT_SETTINGS;

  /**
   * Track files we've already resized to avoid infinite loops
   * (modifying a file can re-trigger the create/modify event).
   */
  private processing = new Set<string>();

  /**
   * Debounce timer per file path so rapid events don't cause races.
   */
  private pending = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Guard against processing files during vault startup.
   * Obsidian fires `create` events for existing files when re-indexing.
   */
  private ready = false;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new ImageResizerSettingTab(this.app, this));

    // Wait for the workspace to be fully loaded before processing events
    this.app.workspace.onLayoutReady(() => {
      this.ready = true;
    });

    // Listen for new files added to the vault
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile) {
          this.scheduleResize(file);
        }
      })
    );

    // Also catch modifications — some paste/drop flows modify an existing file
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) {
          this.scheduleResize(file);
        }
      })
    );

    // Command to manually resize all images in the vault
    this.addCommand({
      id: "resize-all-images",
      name: "Resize all images in vault",
      callback: () => this.resizeAllImages(),
    });

    // Command to resize images in the current note's folder
    this.addCommand({
      id: "resize-images-current-folder",
      name: "Resize images in current folder",
      callback: () => this.resizeImagesInCurrentFolder(),
    });

    // Command to paste without resizing (can be bound to a hotkey)
    this.addCommand({
      id: "paste-full-size-image",
      name: "Paste full size image",
      editorCallback: (editor: Editor) => {
        this.pasteFullSize(editor);
      },
    });

    // Add "Paste full size image" to the editor right-click context menu
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor) => {
        menu.addItem((item) => {
          item
            .setTitle("Paste full size image")
            .setIcon("image")
            .onClick(() => {
              this.pasteFullSize(editor);
            });
        });
      })
    );
  }

  onunload() {
    // Clear any pending timers
    for (const timer of this.pending.values()) {
      clearTimeout(timer);
    }
    this.pending.clear();
    this.processing.clear();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * Debounce resize for a file — waits 500ms after the last event
   * to avoid processing a file that's still being written.
   */
  private scheduleResize(file: TFile) {
    if (!this.ready) return;
    if (!isImageFile(file.name)) return;
    if (this.processing.has(file.path)) return;

    // Clear any existing pending timer for this file
    const existing = this.pending.get(file.path);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.pending.delete(file.path);
      this.processFile(file);
    }, 500);

    this.pending.set(file.path, timer);
  }

  /**
   * Read an image directly from the clipboard, save it to the vault
   * without resizing, and insert the embed link into the editor.
   */
  private async pasteFullSize(editor: Editor) {
    try {
      const clipboardItems = await navigator.clipboard.read();

      let imageBlob: Blob | null = null;
      let mimeType = "";

      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            imageBlob = await item.getType(type);
            mimeType = type;
            break;
          }
        }
        if (imageBlob) break;
      }

      if (!imageBlob) {
        new Notice("No image found on clipboard.");
        return;
      }

      // Determine file extension from mime type
      const extMap: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "image/bmp": "bmp",
      };
      const ext = extMap[mimeType] ?? "png";

      // Generate a filename matching Obsidian's default pattern
      const timestamp = window.moment
        ? window.moment().format("YYYYMMDDHHmmss")
        : Date.now().toString();
      const filename = `Pasted image ${timestamp}.${ext}`;

      // Determine the attachment folder using Obsidian's built-in logic
      const activeFile = this.app.workspace.getActiveFile();
      const folderPath = await this.getAttachmentFolder(activeFile);

      const fullPath = folderPath ? `${folderPath}/${filename}` : filename;

      // Mark as processing so our resize handler ignores it
      this.processing.add(fullPath);

      // Write the file to the vault
      const buffer = await imageBlob.arrayBuffer();
      await this.app.vault.createBinary(fullPath, buffer);

      // Insert the embed link at the cursor
      const embedLink = `![[${filename}]]`;
      editor.replaceSelection(embedLink);

      if (this.settings.showNotice) {
        const kb = Math.round(buffer.byteLength / 1024);
        new Notice(`Pasted full size image (${kb} KB)`);
      }

      // Clean up processing guard after a delay
      setTimeout(() => {
        this.processing.delete(fullPath);
      }, 2000);
    } catch (err) {
      console.error("[Image Resizer] Failed to paste full size image:", err);
      new Notice("Failed to paste image. Make sure an image is copied to your clipboard.");
    }
  }

  /**
   * Resolve the attachment folder path using Obsidian's configured setting.
   * Falls back to the vault root if it can't be determined.
   */
  private async getAttachmentFolder(activeFile: TFile | null): Promise<string> {
    // Use Obsidian's internal method if available
    // @ts-ignore — getAvailablePathForAttachment is not in the public API typings
    if (this.app.vault.getAvailablePathForAttachment) {
      try {
        // This returns a full path like "attachments/image.png"
        // @ts-ignore
        const suggestedPath: string = await this.app.vault.getAvailablePathForAttachment(
          "temp",
          activeFile?.path
        );
        const lastSlash = suggestedPath.lastIndexOf("/");
        return lastSlash >= 0 ? suggestedPath.substring(0, lastSlash) : "";
      } catch {
        // Fall through to manual detection
      }
    }

    // Fallback: read the config directly
    // @ts-ignore
    const config = this.app.vault.config;
    const attachmentSetting = config?.attachmentFolderPath ?? "/";

    if (attachmentSetting === "/") {
      // Vault root
      return "";
    }

    if (attachmentSetting.startsWith("./")) {
      // Relative to current file
      if (activeFile?.parent) {
        const relative = attachmentSetting.substring(2);
        const folder = relative
          ? `${activeFile.parent.path}/${relative}`
          : activeFile.parent.path;

        // Ensure the folder exists
        if (!this.app.vault.getAbstractFileByPath(folder)) {
          await this.app.vault.createFolder(folder);
        }
        return folder;
      }
    }

    // Absolute folder path
    if (!this.app.vault.getAbstractFileByPath(attachmentSetting)) {
      await this.app.vault.createFolder(attachmentSetting);
    }
    return attachmentSetting;
  }

  /**
   * Process a single image file — resize if needed.
   */
  private async processFile(file: TFile) {
    if (this.processing.has(file.path)) return;
    if (!isImageFile(file.name)) return;

    // Check toggle settings
    // We can't easily distinguish paste vs drop vs manual add,
    // so we check both toggles — if either is disabled, the user
    // can use the manual commands instead.
    if (!this.settings.resizeOnPaste && !this.settings.resizeOnDrop) return;

    this.processing.add(file.path);

    try {
      const data = await this.app.vault.readBinary(file);
      const result = await resizeImage(data, file.name, this.settings);

      if (!result) {
        // Image is already within bounds
        return;
      }

      // If converting format (e.g. png -> jpg), rename the file
      if (result.newExtension) {
        const newName = file.name.replace(
          /\.[^.]+$/,
          `.${result.newExtension}`
        );
        const newPath = file.path.replace(file.name, newName);

        // Write new data then rename
        await this.app.vault.modifyBinary(file, result.data);

        // Check if a file at the new path already exists
        const existingFile = this.app.vault.getAbstractFileByPath(newPath);
        if (!existingFile) {
          this.processing.add(newPath);
          await this.app.fileManager.renameFile(file, newPath);
        }
      } else {
        await this.app.vault.modifyBinary(file, result.data);
      }

      if (this.settings.showNotice) {
        const originalKB = Math.round(data.byteLength / 1024);
        const newKB = Math.round(result.data.byteLength / 1024);
        new Notice(
          `Image resized: ${result.originalWidth}×${result.originalHeight} → ${result.width}×${result.height}\n` +
            `${originalKB} KB → ${newKB} KB`,
          4000
        );
      }
    } catch (err) {
      console.error(`[Image Resizer] Failed to process ${file.path}:`, err);
      if (this.settings.showNotice) {
        new Notice(`Image Resizer: Failed to process ${file.name}`);
      }
    } finally {
      // Remove from processing set after a delay to prevent re-triggers
      setTimeout(() => {
        this.processing.delete(file.path);
        // Also clean up the renamed path if applicable
        const ext = getExtension(file.name);
        if (this.settings.convertToJpeg && ext === "png") {
          const newPath = file.path.replace(/\.[^.]+$/, ".jpg");
          this.processing.delete(newPath);
        }
      }, 1000);
    }
  }

  /**
   * Resize all images in the entire vault.
   */
  private async resizeAllImages() {
    const files = this.app.vault.getFiles().filter((f) => isImageFile(f.name));
    await this.batchResize(files, "vault");
  }

  /**
   * Resize images in the same folder as the currently active note.
   */
  private async resizeImagesInCurrentFolder() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No active file — open a note first.");
      return;
    }

    const folder = activeFile.parent;
    if (!folder) {
      new Notice("Could not determine the current folder.");
      return;
    }

    const files = this.app.vault
      .getFiles()
      .filter((f) => f.parent?.path === folder.path && isImageFile(f.name));

    await this.batchResize(files, folder.path);
  }

  /**
   * Process a batch of files and report results.
   */
  private async batchResize(files: TFile[], scope: string) {
    if (files.length === 0) {
      new Notice(`No images found in ${scope}.`);
      return;
    }

    new Notice(`Scanning ${files.length} image(s) in ${scope}…`);

    let resizedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const file of files) {
      try {
        const data = await this.app.vault.readBinary(file);
        const result = await resizeImage(data, file.name, this.settings);

        if (!result) {
          skippedCount++;
          continue;
        }

        this.processing.add(file.path);

        if (result.newExtension) {
          const newPath = file.path.replace(
            /\.[^.]+$/,
            `.${result.newExtension}`
          );
          await this.app.vault.modifyBinary(file, result.data);
          const existingFile = this.app.vault.getAbstractFileByPath(newPath);
          if (!existingFile) {
            this.processing.add(newPath);
            await this.app.fileManager.renameFile(file, newPath);
          }
        } else {
          await this.app.vault.modifyBinary(file, result.data);
        }

        resizedCount++;

        // Stagger to avoid overwhelming the vault
        await sleep(100);
      } catch (err) {
        console.error(`[Image Resizer] Batch error on ${file.path}:`, err);
        errorCount++;
      } finally {
        setTimeout(() => {
          this.processing.delete(file.path);
        }, 1000);
      }
    }

    new Notice(
      `Image Resizer: ${resizedCount} resized, ${skippedCount} already within limits` +
        (errorCount > 0 ? `, ${errorCount} errors` : ""),
      6000
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
