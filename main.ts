import { table } from 'console';
import { App, Component, Editor, htmlToMarkdown, MarkdownRenderChild, MarkdownRenderer, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, ToggleComponent } from 'obsidian';

interface NoteTimerSettings {
	autoLog: boolean;
}

const DEFAULT_SETTINGS: NoteTimerSettings = {
	autoLog: false
}

export default class NoteTimer extends Plugin {
	settings: NoteTimerSettings;
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

		this.registerMarkdownCodeBlockProcessor("timer", (src,el,ctx) => {

			const time = {h:0,m:0,s:0}
			const stringTime = () => `${time.h < 10 ? `0${time.h}` : `${time.h}`}:${time.m < 10 ? `0${time.m}` : `${time.m}`}:${time.s < 10 ? `0${time.s}`: `${time.s}`}`
			let isRunning = false
			const timeDisplay = el.createEl("span", { text: stringTime()})
			const isLog = () => {
				return this.settings.autoLog === true ? true : src.toLowerCase().contains("log:" && "true")
			} 
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


			start.onclick = () => timerControl(true)
			pause.onclick = () => timerControl(false)
			reset.onclick = () => {
				time.h = 0
				time.m = 0
				time.s = 0
				timeDisplay.setText(stringTime())
			}

			if (isLog()){
				const log = el.createEl("button" ,{ text: "log", cls: "timer-log"})
				const area = ctx.getSectionInfo(el).text.toLowerCase()
				log.onclick = async () => {
					console.log('is logging activated? ', isLog())
					const newLinePositions = []
					const logPosition = area.search("# timer log")
					const nextOpenLine = (positions:number[], header:number) => {
						return positions[positions.findIndex(n => n > header)+2]
					};
					for(let c = 0; c < area.length; c++){
						if(area[c].search("\n") >= 0) newLinePositions.push(c)
					}
					console.log('next pos: ', nextOpenLine(newLinePositions, logPosition))
	
					const actFile = this.app.workspace.getActiveFile();
					const curString = await this.app.vault.read(actFile);

					this.app.vault.modify(actFile, curString + "| date | 00:00:00 | nice |" + `\n` )
				}
			}
		})
		

		await this.loadSettings();

		this.addSettingTab(new NoteTimerSettingsTab(this.app, this));

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

class NoteTimerSettingsTab extends PluginSettingTab {
	plugin: NoteTimer;

	constructor(app: App, plugin: NoteTimer) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for Note Timer'});
		containerEl.createEl('p', { text: 'create a timer in any note by adding `timer` to any codeblock.'})

		new Setting(containerEl)
			.setName('Log by default')
			.setDesc('Automatically creates a markdown table below the timer to maintain a log of timer durations.')
			.addToggle( toggle => toggle 
				.setValue(this.plugin.settings.autoLog)
				.onChange(async (value) => {
					this.plugin.settings.autoLog = value;
					await this.plugin.saveSettings();
				}));
	}
}
