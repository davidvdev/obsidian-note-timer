import { table } from 'console';
import { App, Component, Editor, htmlToMarkdown, MarkdownRenderChild, MarkdownRenderer, MarkdownView, Modal, moment, Notice, Plugin, PluginSettingTab, Setting, ToggleComponent } from 'obsidian';

interface NoteTimerSettings {
	autoLog: boolean;
	dateFormat: string;
	logDateLinking: string
}

const DEFAULT_SETTINGS: NoteTimerSettings = {
	autoLog: false,
	dateFormat: 'YYYY-MM-DD',
	logDateLinking: 'none'
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

	createNewTimerLog() {
		
	}

	async addToTimerLog(area:string, duration:string) {
		const newLinePositions = []
		const logPosition = area.search("# timer log")
		let customDate = String(moment().format(this.settings.dateFormat))

		switch (this.settings.logDateLinking) {
			case 'tag':
				customDate = `#${customDate}`
				break;
			case 'link':
				customDate = `[[${customDate}]]`
			default:
				break;
		}

		const nextOpenLine = (positions:number[], header:number) => {
			// header: identifies the table location
			// +2: next 2 line breaks are md table column titles, and format lines
			return positions[positions.findIndex(n => n > header)+2]
		};

		for(let c = 0; c < area.length; c++){
			// creates an array of all new line positions
			if(area[c].search("\n") >= 0) newLinePositions.push(c)
		}

		const actFile = this.app.workspace.getActiveFile();
		const curString = await this.app.vault.read(actFile);
		const curStringPart1 = curString.slice(0, nextOpenLine(newLinePositions, logPosition) )
		const curStringPart2 = curString.slice(nextOpenLine(newLinePositions, logPosition) , curString.length)
		const logEntry = `\n| ${customDate} | ${duration} |  |`

		this.app.vault.modify(actFile, curStringPart1 +  logEntry + curStringPart2)
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
				log.onclick = () => this.addToTimerLog(area, timeDisplay.textContent)
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
		new Setting(containerEl)
			.setName('Log Date Format')
			.setDesc('select a date format')
			.addText(text => text
				.setPlaceholder(String(DEFAULT_SETTINGS.dateFormat))
				.setValue(this.plugin.settings.dateFormat)
				.onChange(async (value) => {
					this.plugin.settings.dateFormat = value
					await this.plugin.saveSettings()
				}))
		new Setting(containerEl)
			.setName('Log Date Linking')
			.setDesc('automatically insert wikilinks, tags, or nothing to dates')
			.addDropdown( dropdown => dropdown
				.addOption('none','none')
				.addOption('tag','#tag')
				.addOption('link','[[link]]')
				.setValue(this.plugin.settings.logDateLinking)
				.onChange( async (value) => {
					this.plugin.settings.logDateLinking = value
					await this.plugin.saveSettings()
				})
				)
	}
}
