
import { randomUUID } from 'crypto';
import { Moment } from 'moment';
import { App, MarkdownPostProcessor, MarkdownPostProcessorContext, moment, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface NoteTimerSettings {
	autoLog: boolean;
	dateFormat: string;
	logDateLinking: string;
	msDisplay: boolean;
  startButtonText: string;
  stopButtonText: string;
  resetButtonText: string;
  showResetButton: boolean;
  continueRunningOnReset: boolean;
}

const DEFAULT_SETTINGS: NoteTimerSettings = {
	autoLog: false,
	dateFormat: 'YYYY-MM-DD',
	logDateLinking: 'none',
	msDisplay: true,
  startButtonText: 'Play',
  stopButtonText: 'Stop',
  resetButtonText: 'Reset',
  showResetButton: true,
  continueRunningOnReset: false,
}

interface RunningTimerSettings {
  id: string;
  startDate: null | Date;
  status: 'stopped' | 'running';
  timer: number | null;
}

export default class NoteTimer extends Plugin {
	settings: NoteTimerSettings;
	timerInterval : null | number = null;

	nextOpenLine(positions:number[], target:number) {
		// target: identifies the table location
		// +3: next 3 line breaks are md table column titles, and format lines
		return positions[positions.findIndex(n => n > target)+3]
	}

  readLocalConfig(src: string, key: string) {
    let value = src.replace(/\r/g,'').split('\n').find(line => line.startsWith(key+':'))
    return value && value.replace(key+':','').trim()
  }

	isTrue(src:string, key:string, setting:boolean ) {
		if(['true','false'].includes(this.readLocalConfig(src,key))){
      return this.readLocalConfig(src,key) == 'true'
    }
		return setting

  }

  async calculateTotalDuration(logPosition:number, ctx:MarkdownPostProcessorContext) {
    const actFile = this.app.vault.getFiles().find(file => file.path === ctx.sourcePath)
    const curString = await this.app.vault.read(actFile);

    let lines = curString.replace(/\r/g,'').split('\n');

    let pos = 0;
    let logTitleLine = lines.findIndex(line => {
      pos += line.length+1; //new line
      return pos > logPosition;
    });

    let total = 0;
    let line = '';
    for (let index = logTitleLine+3; index < lines.length; index++) {
      line = lines[index]
      if(!line.startsWith('|')) break;

      let matches = line.match(/(?<=(\|[^|]+){2}\|)[^|]+/);
      let value = 0 
      try {
        value = parseFloat(matches[0].trim()) || 0;
      } catch {}
      total += value;
    }
    const totalTimeText = '\nTotal Time: ' + total.toLocaleString('en-EN',{minimumFractionDigits:3, maximumFractionDigits:3});

    return this.app.vault.modify(actFile, curString.replace(/\nTotal Time: \d+\.\d+/,totalTimeText))
  }

	async addToTimerLog(startDate: Moment,logPosition:number, ctx:MarkdownPostProcessorContext) {
    
    const actFile = this.app.vault.getFiles().find(file => file.path === ctx.sourcePath)
		const curString = await this.app.vault.read(actFile);

    let stopDate = moment()

    const durationMs = stopDate.diff(startDate,'milliseconds');

    const durationtext = (durationMs/(3600*1000)).toLocaleString('en-EN',{minimumFractionDigits:3, maximumFractionDigits:3});

		let startDateText = startDate.format(this.settings.dateFormat)
		let stopDateText = stopDate.format(this.settings.dateFormat)
    
		switch (this.settings.logDateLinking) {
			case 'tag':
				startDateText = `#${startDateText}`
				stopDateText = `#${stopDateText}`
				break;
			case 'link':
				startDateText = `[[${startDateText}]]`
				stopDateText = `[[${stopDateText}]]`
			default:
				break;
		}

    const newLinePositions = []

		for(let c = 0; c < curString.length; c++){
			// creates an array of all new line positions
			if(curString[c] == '\n') newLinePositions.push(c);
		}

		const curStringPart1 = curString.slice(0, this.nextOpenLine(newLinePositions, logPosition))
		const curStringPart2 = curString.slice(this.nextOpenLine(newLinePositions, logPosition),curString.length)
		const logEntry = `\n| ${startDateText} | ${stopDateText} | ${durationtext} |  |`

		return this.app.vault.modify(actFile, curStringPart1 + logEntry + curStringPart2)
	}

	async createNewTimerLog(ctx:MarkdownPostProcessorContext) {
		const actFile = this.app.vault.getFiles().find(file => file.path === ctx.sourcePath)
		const curString = await this.app.vault.read(actFile);
    const timerBlockStart = curString.toLowerCase().search("```timer")
		const timerBlockEnd = curString.slice(timerBlockStart, curString.length).indexOf("```", 3) + 3
		const curStringPart1 = curString.slice(0, timerBlockStart + timerBlockEnd)
		const curStringPart2 = curString.slice(timerBlockStart + timerBlockEnd, curString.length)
		const tableStr = `\n###### Timer Log\nTotal Time: 0.000\n| Start | Stop | Duration | Comments |\n| ----- | ---- | -------- | ------- |`
    return this.app.vault.modify(actFile, curStringPart1 + tableStr + curStringPart2)
	}

	async saveTimerUID(ctx:MarkdownPostProcessorContext, id: string) {
		const actFile = this.app.vault.getFiles().find(file => file.path === ctx.sourcePath)
		const curString = await this.app.vault.read(actFile);
		const timerBlockStart = curString.toLowerCase().search("```timer")
		const timerBlockEnd = curString.slice(timerBlockStart, curString.length).indexOf("```", 3)
		const curStringPart1 = curString.slice(0, timerBlockStart + timerBlockEnd)
		const curStringPart2 = curString.slice(timerBlockStart + timerBlockEnd,curString.length)
		const idString = `_timerUID:${id}\n`;
    return this.app.vault.modify(actFile, curStringPart1 + idString + curStringPart2);
	}

  timers:{[key:string]:RunningTimerSettings} = {};
  
	async onload() {
    await this.loadSettings();
		this.addSettingTab(new NoteTimerSettingsTab(this.app, this));

		this.registerMarkdownCodeBlockProcessor("timer", (src,el,ctx) => {
      let uid = this.readLocalConfig(src,'_timerUID');
      if(!uid) {
        uid = randomUUID();
        this.saveTimerUID(ctx, uid);
        this.timers[uid] = {
          id: uid,
          status: 'stopped',
          startDate: null,
          timer: null
        }
      }

      if(!this.timers[uid]) {
      this.timers[uid] = {
          id: uid,
          status: 'stopped',
          startDate: null,
          timer: null
        }
      }

      const currentTimer = this.timers[uid];

			const updateTime = () => {
        
        if(currentTimer.status == 'stopped') return timeDisplay.setText('-:-:-');
        let start = moment(currentTimer.startDate);
        let now = moment();

        const days = now.diff(start,'days');
        start.add(days,'days')
        const hours = now.diff(start,'hours');
        start.add(hours,'hours')
        const minutes = now.diff(start,'minutes');
        start.add(minutes,'minutes')
        const seconds = now.diff(start,'seconds');
        start.add(seconds,'seconds')
        const milliseconds = now.diff(start,'milliseconds');
        start.add(milliseconds,'milliseconds')
        function format(value:number, digits:number=2) {
          return String(value).padStart(digits,'0');
        }
        timeDisplay.setText(
          (days > 0 ? days + ':' : '')
                + format(hours)
          + ':' + format(minutes)
          + ':' + format(seconds)
          + (this.isTrue(src, 'ms', this.settings.msDisplay) ? '.' + format(milliseconds,3) : '')
        )
			}
			
      const timerControl = () => {
        if(currentTimer.status=='running') {
          window.clearInterval(currentTimer.timer)
          currentTimer.timer = window.setInterval(() => {
            updateTime();
          }, 10);
          this.registerInterval(currentTimer.timer);
        } else {
          window.clearInterval(currentTimer.timer);
        }
      }

      const timeDisplay = el.createEl("span", { text: '-:-:-'})

			const buttonDiv = el.createDiv({ cls: "timer-button-group"})
			const start = buttonDiv.createEl("button", { text: this.readLocalConfig(src,'startButtonText') || this.settings.startButtonText, cls: "timer-start" })
			const stop = buttonDiv.createEl("button" ,{ text: this.readLocalConfig(src,'stopButtonText') || this.settings.stopButtonText, cls: "timer-pause"});
			const reset = this.isTrue(src,'showResetButton',this.settings.showResetButton) && buttonDiv.createEl("button" ,{ text: this.readLocalConfig(src,'resetButtonText') || this.settings.resetButtonText, cls: "timer-reset"});
      
      if(currentTimer.status=='running') {
        timerControl();
        start.disabled = true;
        stop.disabled = false;
      } else {
        start.disabled = false;
        stop.disabled = true;
      }

			start.onclick = () => {
        currentTimer.startDate = new Date();
        currentTimer.status = 'running';
        timerControl();
        start.disabled = true;
        stop.disabled = false;
      }
			stop.onclick = async () => {
        let stopTime = moment(currentTimer.startDate);
        currentTimer.startDate = null;
        currentTimer.status = 'stopped';
        timerControl();
        timeDisplay.setText('-:-:-')
        start.disabled = false;
        stop.disabled = true;
        let area = ctx.getSectionInfo(el).text 
        let logPosition = area.search("# Timer Log")
        if(logPosition <= 0){
          await this.createNewTimerLog(ctx);
          area = ctx.getSectionInfo(el).text 
          logPosition = area.search("# Timer Log")
        }
        await this.addToTimerLog(stopTime, logPosition, ctx);
        await this.calculateTotalDuration(logPosition, ctx);
      }
			if(reset) {
        reset.onclick = () => {
          if(this.settings.continueRunningOnReset && currentTimer.status == 'running') {
            currentTimer.startDate = new Date;
          } else {
            currentTimer.startDate = null;
            currentTimer.status = 'stopped';
            timerControl();
            timeDisplay.setText('-:-:-')
            start.disabled = false;
            stop.disabled = true;            
          }
			  }
			}
		});

	}

	onunload() {
		console.log('unloading plugin');
    this.timers = {};
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
			.setName('Start Button Text')
			.setDesc('Display text for the Start button')
      .addText(text => text
				.setPlaceholder(String(DEFAULT_SETTINGS.startButtonText))
				.setValue(this.plugin.settings.startButtonText)
				.onChange(async (value) => {
					this.plugin.settings.startButtonText = value
					await this.plugin.saveSettings()
				}))
		
    new Setting(containerEl)
			.setName('Stop Button Text')
			.setDesc('Display text for the Stop button')
      .addText(text => text
				.setPlaceholder(String(DEFAULT_SETTINGS.stopButtonText))
				.setValue(this.plugin.settings.stopButtonText)
				.onChange(async (value) => {
					this.plugin.settings.stopButtonText = value
					await this.plugin.saveSettings()
				}))
		
    new Setting(containerEl)
			.setName('Reset Button Text')
			.setDesc('Display text for the Reset button')
      .addText(text => text
				.setPlaceholder(String(DEFAULT_SETTINGS.resetButtonText))
				.setValue(this.plugin.settings.resetButtonText)
				.onChange(async (value) => {
					this.plugin.settings.resetButtonText = value
					await this.plugin.saveSettings()
				}))

    new Setting(containerEl)
			.setName('Continue running on reset')
			.setDesc('If this is active, the timer will keep running after a reset.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.continueRunningOnReset)
				.onChange(async (value) => {
					this.plugin.settings.continueRunningOnReset = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Donate')
			.setDesc('If you like this Plugin, please consider donating:')
			.addButton( button => button
				.buttonEl.outerHTML = `<a href='https://ko-fi.com/S6S55K9XD' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://cdn.ko-fi.com/cdn/kofi3.png?v=3' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>`
			)}
}
