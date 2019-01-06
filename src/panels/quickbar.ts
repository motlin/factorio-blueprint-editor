import G from '../common/globals'
import { InventoryContainer } from './inventory'
import Panel from '../controls/panel'
import Slot from '../controls/slot'

export class QuickbarSlot extends Slot {

    public itemName: string

    constructor() {
        super()
    }

    public assignItem(itemName: string) {
        this.itemName = itemName

        if (this.content) this.content.destroy()
        this.content = InventoryContainer.createIcon(itemName, false)
        this.addChild(this.content)
    }

    public unassignItem() {
        this.itemName = undefined
        this.content.destroy()
    }
}

export class QuickbarContainer extends Panel {

    static createTriangleButton(width: number, height: number) {
        const button = new PIXI.Graphics()

        button
            .beginFill(G.colors.pannel.slot)
            .moveTo(0, height)
            .lineTo(width / 2, 0)
            .lineTo(width, height)
            .lineTo(0, height)
            .endFill()

        button.interactive = true

        button.on('pointerover', () => button.alpha = 0.8)
        button.on('pointerout', () => button.alpha = 1)

        return button
    }

    private iWidth = 442
    private iHeight: number
    private rows: number

    private slots: QuickbarSlot[]
    private slotsContainer: PIXI.Container

    constructor(rows = 1, itemNames?: string[]) {
        super(442, 24 + rows * 38, G.colors.pannel.background, 0.7, 2)

        this.rows = rows
        this.iHeight = 24 + rows * 38
        this.slots = new Array<QuickbarSlot>(rows * 10)

        this.on('pointerover', () => { if (G.BPC.paintContainer) G.BPC.paintContainer.hide() })
        this.on('pointerout',  () => { if (G.BPC.paintContainer) G.BPC.paintContainer.show() })

        this.slotsContainer = new PIXI.Container()
        this.slotsContainer.position.set(12, 12)
        this.addChild(this.slotsContainer)

        this.generateSlots(itemNames)

        const t = QuickbarContainer.createTriangleButton(15, 14)
        t.position.set((this.iWidth - t.width) / 2, (this.iHeight - t.height) / 2)
        t.on('pointerdown', () => this.changeActiveQuickbar())
        this.addChild(t)
    }

    generateSlots(itemNames?: string[]) {
        for (let r = 0; r < this.rows; r++) {
            for (let i = 0; i < 10; i++) {
                const quickbarSlot = new QuickbarSlot()
                quickbarSlot.position.set(((36 + 2) * i) + (i > 4 ? 38 : 0), 38 * r)

                if (itemNames && itemNames[(r * 10) + i]) {
                    quickbarSlot.content = InventoryContainer.createIcon(itemNames[(r * 10) + i], false)
                    quickbarSlot.data = itemNames[(r * 10) + i]
                }

                quickbarSlot.on('pointerup', (e: PIXI.interaction.InteractionEvent) => {
                    // Use Case 1: Left Click  & Slot=Empty & Mouse=Painting >> Assign Mouse Item to Slot
                    // Use Case 2: Left Click  & Slot=Item  & Mouse=Painting >> Assign Slot Item to Mouse
                    // Use Case 3: Left Click  & Slot=Empty & Mouse=Empty    >> Do Nothing
                    // Use Case 4: Left Click  & Slot=Item  & Mouse=Empty    >> Assign Slot Item to Mouse
                    // Use Case 5: Right Click & Slot=*     & Mouse=*        >> Unassign Slot

                    // >> Left Click (UC1-UC4)
                    if (e.data.button === 0) {
                        // >> Mouse == Painting (UC1,UC2)
                        if (G.currentMouseState === G.mouseStates.PAINTING) {
                            // >> Slot == Empty (UC1)
                            if (!quickbarSlot.itemName) {
                                quickbarSlot.content = InventoryContainer.createIcon(G.BPC.paintContainer.getItemName(), false)
                                quickbarSlot.data = G.BPC.paintContainer.getItemName()
                            // >> Slot == Item (UC2)
                            } else {
                                G.BPC.spawnEntityAtMouse(quickbarSlot.itemName)
                                G.BPC.paintContainer.hide()
                            }
                        // >> Slot == Item (UC4)
                        } else if (quickbarSlot.itemName) {
                            G.BPC.spawnEntityAtMouse(quickbarSlot.itemName)
                            G.BPC.paintContainer.hide()
                        }

                    // >> Right Click (UC5)
                    } else if (e.data.button === 2) {
                        quickbarSlot.content = undefined
                        quickbarSlot.data = undefined
                    }
                })

                this.slots[(r * 10) + i] = quickbarSlot
                this.slotsContainer.addChild(quickbarSlot)
            }
        }
    }

    public bindKeyToSlot(slot: number) {
        const itemName = this.slots[slot].data
        if (!itemName) return

        if (G.currentMouseState === G.mouseStates.PAINTING && G.BPC.paintContainer.getItemName() === itemName) {
            G.BPC.paintContainer.destroy()
            G.BPC.paintContainer = undefined
            G.currentMouseState = G.mouseStates.NONE
            return
        }

        G.BPC.spawnEntityAtMouse(itemName)
    }

    public changeActiveQuickbar() {
        this.slotsContainer.removeChildren()

        let itemNames = this.getAllItemNames()
        // Left shift array by 10
        itemNames = itemNames.concat(itemNames.splice(0, 10))
        this.generateSlots(itemNames)
    }

    public getAllItemNames() {
        return this.slots.map(s => s.data)
    }

    setPosition() {
        this.position.set(
            G.app.screen.width / 2 - this.width / 2,
            G.app.screen.height - this.height
        )
    }
}
