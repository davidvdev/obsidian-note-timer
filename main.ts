
import { App, MarkdownPostProcessor, MarkdownPostProcessorContext, moment, Plugin, PluginSettingTab, Setting } from 'obsidian';
import * as feather from "feather-icons";

interface NoteTimerSettings {
	autoLog: boolean;
	dateFormat: string;
	logDateLinking: string;
	msDisplay: boolean;
	buttonLabels: string;
}

const DEFAULT_SETTINGS: NoteTimerSettings = {
	autoLog: false,
	dateFormat: 'YYYY-MM-DD',
	logDateLinking: 'none',
	msDisplay: true,
	buttonLabels: 'icons'
}

export default class NoteTimer extends Plugin {
	settings: NoteTimerSettings;
	timerInterval : null | number = null

	nextOpenLine(positions:number[], target:number) {
		// target: identifies the table location
		// +2: next 2 line breaks are md table column titles, and format lines
		return positions[positions.findIndex(n => n > target)+2]
	}

	isTrue(src:string, settingName:string, settingValue:boolean ) {
		if(src.toLowerCase().contains(`${settingName}: true` || `${settingName}:true`)) return true
		if(src.toLowerCase().contains(`${settingName}: false` || `${settingName}:false`)) return false
		return settingValue
	}

	buttonLabelSwitch(button: string, setting:string){
		switch(setting){
			case 'icons':
				switch(button){
					case 'start':
						return feather.icons.start.toSvg()
					case 'pause':
						return '⏸'
					case 'reset':
						return '🔄'
					case 'log':
						return '💾'
				}
				break;
			case 'text':
				switch(button){
					case 'start':
						return 'start'
					case 'pause':
						return 'pause'
					case 'reset':
						return 'reset'
					case 'log':
						return 'log'
				}
				break;
		}
		
	}

	buttonLabel(src:string, settingName:string, settingValue:string, button:string) {
		if(src.toLowerCase().contains(`${settingName}: icons` || `${settingName}:icons`)) return this.buttonLabelSwitch(button, 'icons')
		if(src.toLowerCase().contains(`${settingName}: text` || `${settingName}:text`)) return this.buttonLabelSwitch(button, 'text')
		else return this.buttonLabelSwitch(button, settingValue)
	}

	async addToTimerLog(duration:string, logPosition:number, ctx:MarkdownPostProcessorContext) {
		const actFile = this.app.vault.getFiles().find(file => file.path === ctx.sourcePath)
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

	async createNewTimerLog(ctx:MarkdownPostProcessorContext) {
		const actFile = this.app.vault.getFiles().find(file => file.path === ctx.sourcePath)
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

			const time = {h:0,m:0,s:0, ms:0}

			const runTimer = (h:number, m:number, s:number, ms:number) => {
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

			const stringTime = () => {
				if(this.isTrue(src, 'ms', this.settings.msDisplay)){
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
						const runningTime = runTimer(time.h, time.m, time.s, time.ms)
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
			const start = buttonDiv.createEl("button", { text: `${this.buttonLabel(src, 'buttonLabels', this.settings.buttonLabels, 'start')}`, cls: "timer-start" })
			const pause = buttonDiv.createEl("button", { text: `${this.buttonLabel(src, 'buttonLabels', this.settings.buttonLabels, 'pause')}`, cls: "timer-pause"})
			const reset = buttonDiv.createEl("button", { text: `${this.buttonLabel(src, 'buttonLabels', this.settings.buttonLabels, 'reset')}`, cls: "timer-reset"})


			start.onclick = () => timerControl(true)
			pause.onclick = () => timerControl(false)
			reset.onclick = () => {
				time.h = 0
				time.m = 0
				time.s = 0
				time.ms = 0
				timeDisplay.setText(stringTime())
			}

			if (this.isTrue(src, 'log', this.settings.autoLog)){
				const log = buttonDiv.createEl("button" ,{ text: `${this.buttonLabel(src, 'buttonLabels', this.settings.buttonLabels, 'log')}`, cls: "timer-log"})
				log.onclick = () => {
					const area = ctx.getSectionInfo(el).text.toLowerCase()
					let logPosition = area.search("# timer log")
					if(logPosition > 0){
						this.addToTimerLog(timeDisplay.textContent, logPosition, ctx)
					} else {
						this.createNewTimerLog(ctx)
					}
				}
			}
		})
		

		await this.loadSettings();

		this.addSettingTab(new NoteTimerSettingsTab(this.app, this));

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

		containerEl.createEl('h2', {text: 'Obsidian Note Timer Settings'});
		containerEl.createEl('p', { text: `Find the documentation `}).createEl('a', { text:`here`, href: `https://github.com/davidvdev/obsidian-note-timer#readme`})

		new Setting(containerEl)
			.setName('Display Milleseconds')
			.setDesc('Turn off to display HH:MM:SS')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.msDisplay)
				.onChange(async (value) => {
					this.plugin.settings.msDisplay = value
					await this.plugin.saveSettings()
				}))
		new Setting(containerEl)
			.setName('Log by default')
			.setDesc('Enables the log button and automatically creates a markdown table below the timer to store the date, timer duration, and an empty cell for comments.')
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
				}))

		new Setting(containerEl)
			.setName('Button Labels')
			.setDesc('Choose whether timer buttons are labeled with symbols or text')
			.addDropdown( dropdown => dropdown
				.addOption('text','text')
				.addOption('icons','icons')
				.setValue(this.plugin.settings.buttonLabels)
				.onChange( async (value) => {
					this.plugin.settings.buttonLabels = value
					await this.plugin.saveSettings()
				}))

		new Setting(containerEl)
			.setName('Donate')
			.setDesc('If you like this Plugin, please consider donating:')
			.addButton( button => button
				.buttonEl.outerHTML = `<a href='https://ko-fi.com/S6S55K9XD' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://cdn.ko-fi.com/cdn/kofi3.png?v=3' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>`
			)}
}
