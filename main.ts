import { table } from 'console';
import { App, Component, Editor, htmlToMarkdown, MarkdownRenderChild, MarkdownRenderer, MarkdownView, Modal, moment, Notice, Plugin, PluginSettingTab, Setting, ToggleComponent } from 'obsidian';

interface NoteTimerSettings {
	autoLog: boolean;
	dateFormat: string;
	logDateLinking: string;
	msDisplay: boolean
}

const DEFAULT_SETTINGS: NoteTimerSettings = {
	autoLog: false,
	dateFormat: 'YYYY-MM-DD',
	logDateLinking: 'none',
	msDisplay: true
}

export default class NoteTimer extends Plugin {
	settings: NoteTimerSettings;
	timerInterval : null | number = null

	runTimer(h:number, m:number, s:number, ms:number) {
		ms++
		if (ms === 100){
			ms = 0
			s++
		}
		if (s === 60){
			s = 0
			m++
		}
		if (m === 60){
			m = 0
			h++
		}
		return {h,m,s,ms}
	}

	nextOpenLine(positions:number[], target:number) {
		// target: identifies the table location
		// +2: next 2 line breaks are md table column titles, and format lines
		return positions[positions.findIndex(n => n > target)+2]
	}


	async addToTimerLog(duration:string, logPosition:number) {
		const actFile = this.app.workspace.getActiveFile();
		const curString = await this.app.vault.read(actFile);
		const newLinePositions = []
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

		for(let c = 0; c < curString.length; c++){
			// creates an array of all new line positions
			if(curString[c].search("\n") >= 0) newLinePositions.push(c)
		}

		const curStringPart1 = curString.slice(0, this.nextOpenLine(newLinePositions, logPosition) )
		const curStringPart2 = curString.slice(this.nextOpenLine(newLinePositions, logPosition) , curString.length)
		const logEntry = `\n| ${customDate} | ${duration} |  |`

		this.app.vault.modify(actFile, curStringPart1 +  logEntry + curStringPart2)
	}

	async createNewTimerLog() {
		console.log('Creating new timer log...')
		
		const actFile = this.app.workspace.getActiveFile();
		const curString = await this.app.vault.read(actFile);
		const timerBlockStart = curString.toLowerCase().search("```timer")
		const timerBlockEnd = curString.slice(timerBlockStart, curString.length).indexOf("```", 3) + 3
		const curStringPart1 = curString.slice(0, timerBlockStart + timerBlockEnd)
		const curStringPart2 = curString.slice(timerBlockStart + timerBlockEnd, curString.length)
		const tableStr = `\n###### Timer Log\n| date | duration | comments|\n| ---- | -------- | ------- |\n`

		this.app.vault.modify(actFile, curStringPart1 +  tableStr + curStringPart2)
	}

	async onload() {

		this.registerMarkdownCodeBlockProcessor("timer", (src,el,ctx) => {

			// localized settings
			const isLog = () => this.settings.autoLog === true ? true : src.toLowerCase().contains("log: true" || "log:true")
			const isMsDisplay = () => this.settings.msDisplay === true ? true : src.toLowerCase().contains("ms: true" || "ms:true")

			const time = {h:0,m:0,s:0, ms:0}
			const stringTime = () => {
				if(isMsDisplay()){
					return(
						`${time.h < 10 ? `0${time.h}` : `${time.h}`}`
						+`:${time.m < 10 ? `0${time.m}` : `${time.m}`}`
						+`:${time.s < 10 ? `0${time.s}`: `${time.s}`}`
						+`:${time.ms}`
					)
				} else {
					return(
						`${time.h < 10 ? `0${time.h}` : `${time.h}`}`
						+`:${time.m < 10 ? `0${time.m}` : `${time.m}`}`
						+`:${time.s < 10 ? `0${time.s}`: `${time.s}`}`
					)
				}
			}
			let isRunning = false
			const timeDisplay = el.createEl("span", { text: stringTime()})
			
			
			const timerControl = (cmd:Boolean) => {
				if(cmd && !isRunning){
					stringTime()
					isRunning = true
					window.clearInterval(this.timerInterval)
					this.timerInterval = null
					this.timerInterval = window.setInterval(() => {
						const runningTime = this.runTimer(time.h, time.m, time.s, time.ms)
						time.h = runningTime.h
						time.m = runningTime.m
						time.s = runningTime.s
						time.ms = runningTime.ms
						timeDisplay.setText(stringTime())
					}, 10)
				} else if (!cmd && isRunning){
					isRunning = false
					clearInterval(this.timerInterval)
				}
				this.registerInterval(this.timerInterval)
			}

			const buttonDiv = el.createDiv({ cls: "timer-button-group"})
			const start = buttonDiv.createEl("button", { text: "start", cls: "timer-start" })
			const pause = buttonDiv.createEl("button" ,{ text: "pause", cls: "timer-pause"})
			const reset = buttonDiv.createEl("button" ,{ text: "reset", cls: "timer-reset"})


			start.onclick = () => timerControl(true)
			pause.onclick = () => timerControl(false)
			reset.onclick = () => {
				time.h = 0
				time.m = 0
				time.s = 0
				time.ms = 0
				timeDisplay.setText(stringTime())
			}

			if (isLog()){
				const log = buttonDiv.createEl("button" ,{ text: "log", cls: "timer-log"})
				log.onclick = () => {
					const area = ctx.getSectionInfo(el).text.toLowerCase()
					let logPosition = area.search("# timer log")
					if(logPosition > 0){
						this.addToTimerLog(timeDisplay.textContent, logPosition)
					} else {
						this.createNewTimerLog()
					}
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
			.setName('Display Milleseconds')
			.setDesc('If faster timers induce anxiety, you can turn off the millesecond display')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.msDisplay)
				.onChange(async (value) => {
					this.plugin.settings.msDisplay = value
					await this.plugin.saveSettings()
				}))
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
