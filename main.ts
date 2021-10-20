import { App, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	timerInterval : null | number = null

	runTimer(h:number, m:number, s:number) {
		s++
		if (s === 60){
			s = 0
			m++
		}
		if (m === 60){
			m = 0
			h++
		}
		return {h,m,s}
	}

	async onload() {
		console.log('loading plugin');

		this.registerMarkdownCodeBlockProcessor("timer", (src,el,ctx) => {

			console.log('src', src.split(" "))

			const time = {h:0,m:0,s:0}
			const stringTime = () => `${time.h < 10 ? `0${time.h}` : `${time.h}`}:${time.m < 10 ? `0${time.m}` : `${time.m}`}:${time.s < 10 ? `0${time.s}`: `${time.s}`}`
			let isRunning = false

			const timeDisplay = el.createEl("span", { text: stringTime()})

			const timerControl = (cmd:Boolean) => {
				if(cmd && !isRunning){
					isRunning = true
					window.clearInterval(this.timerInterval)
					this.timerInterval = null
					this.timerInterval = window.setInterval(() => {
						const runningTime = this.runTimer(time.h, time.m, time.s)
						time.h = runningTime.h
						time.m = runningTime.m
						time.s = runningTime.s
						timeDisplay.setText(stringTime())
					}, 1000)
				} else if (!cmd && isRunning){
					isRunning = false
					clearInterval(this.timerInterval)
				}
				this.registerInterval(this.timerInterval)
			}
			
			const start = el.createEl("button", { text: "start", cls: "timer-start" })
			const pause = el.createEl("button" ,{ text: "pause", cls: "timer-pause"})
			const reset = el.createEl("button" ,{ text: "reset", cls: "timer-reset"})
			const log = el.createEl("button" ,{ text: "log", cls: "timer-log"})

			start.onclick = () => timerControl(true)
			pause.onclick = () => timerControl(false)
			reset.onclick = () => {
				time.h = 0
				time.m = 0
				time.s = 0
				timeDisplay.setText(stringTime())
			}
		})

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
