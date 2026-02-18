import { App, PluginSettingTab, Setting } from "obsidian";
import type ImageResizerPlugin from "./main";

export interface ImageResizerSettings {
  maxWidth: number;
  maxHeight: number;
  jpegQuality: number;
  convertToJpeg: boolean;
  resizeOnPaste: boolean;
  resizeOnDrop: boolean;
  showNotice: boolean;
  skipExtensions: string[];
}

export const DEFAULT_SETTINGS: ImageResizerSettings = {
  maxWidth: 1920,
  maxHeight: 1080,
  jpegQuality: 85,
  convertToJpeg: false,
  resizeOnPaste: true,
  resizeOnDrop: true,
  showNotice: true,
  skipExtensions: [],
};

export class ImageResizerSettingTab extends PluginSettingTab {
  plugin: ImageResizerPlugin;

  constructor(app: App, plugin: ImageResizerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Image Resizer Settings" });

    containerEl.createEl("p", {
      text: "Images smaller than the specified dimensions will not be modified.",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Maximum width")
      .setDesc("Maximum image width in pixels. Set to 0 to ignore width.")
      .addText((text) =>
        text
          .setPlaceholder("1920")
          .setValue(String(this.plugin.settings.maxWidth))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 0) {
              this.plugin.settings.maxWidth = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Maximum height")
      .setDesc("Maximum image height in pixels. Set to 0 to ignore height.")
      .addText((text) =>
        text
          .setPlaceholder("1080")
          .setValue(String(this.plugin.settings.maxHeight))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 0) {
              this.plugin.settings.maxHeight = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("JPEG quality")
      .setDesc("Quality for JPEG output (1–100). Higher = better quality, larger file.")
      .addSlider((slider) =>
        slider
          .setLimits(1, 100, 1)
          .setValue(this.plugin.settings.jpegQuality)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.jpegQuality = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Convert PNG to JPEG")
      .setDesc(
        "Convert PNG images to JPEG when resizing. Reduces file size but removes transparency."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.convertToJpeg)
          .onChange(async (value) => {
            this.plugin.settings.convertToJpeg = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Resize on paste")
      .setDesc("Automatically resize images pasted into notes.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.resizeOnPaste)
          .onChange(async (value) => {
            this.plugin.settings.resizeOnPaste = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Resize on drop/import")
      .setDesc("Automatically resize images dragged or imported into the vault.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.resizeOnDrop)
          .onChange(async (value) => {
            this.plugin.settings.resizeOnDrop = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show notification")
      .setDesc("Show a notice when an image is resized.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showNotice)
          .onChange(async (value) => {
            this.plugin.settings.showNotice = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
