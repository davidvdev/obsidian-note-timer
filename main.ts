import { App, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		console.log('loading plugin');

		// this.registerMarkdownPostProcessor((el, ctx) => {
		// 	const codeblocks = el.querySelectorAll("code")

		// 	for (let i = 0; i < codeblocks.length; i++){
		// 		const codeblock = codeblocks.item(i)
		// 		const text = codeblock.innerText.trim()
		// 		const isTimer = text[0] === "timer"

		// 		console.log('codeblock:', codeblock)
		// 		console.log('text:', text)
		// 		console.log('isTimer:', isTimer)

		// 		if(isTimer) console.log('found timer')
		// 	}
		// })

		this.registerMarkdownCodeBlockProcessor("timer", (src,el,ctx) => {
			console.log('timer found')
			console.log('src: ', src)
			console.log('el: ', el)
			console.log('ctx: ', ctx)

			const timerStart = (evt:EventTarget) => {
				console.log('evt', evt)
			}

			const time = el.createEl("span", { text: "00:00" })
			const start = el.createEl("button", { text: "start", cls: "timer-start" })
			const stop = el.createEl("button" ,{ text: "stop", cls: "timer-stop"})
			const pause = el.createEl("button" ,{ text: "pause", cls: "timer-pause"})
			const reset = el.createEl("button" ,{ text: "reset", cls: "timer-reset"})

			time.setText("00:00")
			start.onclick = (evt) => timerStart(evt.target)


			
		})








		const view = this.app.workspace.getActiveViewOfType(MarkdownView)
		// console.log('view: ', view)

		const files = this.app.vault.getMarkdownFiles()
		// console.log('files: ', files)

		await this.loadSettings();

		this.addSettingTab(new SampleSettingTab(this.app, this));

		this.registerCodeMirror((cm: CodeMirror.Editor) => {
			// console.log('codemirror', cm);
		});
	}

	onunload() {
		console.log('unloading plugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for my awesome plugin.'});

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					console.log('Secret: ' + value);
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
