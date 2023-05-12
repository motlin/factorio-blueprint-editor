import Ajv, { KeywordDefinition } from 'ajv'
import pako from 'pako'
import FD from './factorioData'
import blueprintSchema from './blueprintSchema.json'
import { Blueprint } from './Blueprint'
import { Book } from './Book'

class CorruptedBlueprintStringError {
    public error: unknown
    public constructor(error: unknown) {
        this.error = error
    }
}

class BookWithNoBlueprintsError {
    public error = 'Blueprint book contains no blueprints!'
}

class ModdedBlueprintError {
    public errors: Ajv.ErrorObject[]
    public constructor(errors: Ajv.ErrorObject[]) {
        this.errors = errors
    }
}

class TrainBlueprintError {
    public errors: Ajv.ErrorObject[]
    public constructor(errors: Ajv.ErrorObject[]) {
        this.errors = errors
    }
}

const keywords: Record<string, KeywordDefinition> = {
    entityName: {
        validate: (data: string) => !!FD.entities[data],
        errors: false,
        schema: false,
    },
    itemName: {
        validate: (data: string) => !!FD.items[data],
        errors: false,
        schema: false,
    },
    fluidName: {
        validate: (data: string) => !!FD.fluids[data],
        errors: false,
        schema: false,
    },
    recipeName: {
        validate: (data: string) => !!FD.recipes[data],
        errors: false,
        schema: false,
    },
    tileName: {
        validate: (data: string) => !!FD.tiles[data],
        errors: false,
        schema: false,
    },
    itemFluidSignalName: {
        validate: (data: string) => !!FD.items[data] || !!FD.fluids[data] || !!FD.signals[data],
        errors: false,
        schema: false,
    },
}

const validate = new Ajv({
    keywords,
    verbose: true,
    strictKeywords: 'log',
}).compile(blueprintSchema)

const nameMigrations: Record<string, string> = {
    // if (blueprintVersion < getFactorioVersion(0, 17, 0))
    '"raw-wood"': '"wood"',
    '"science-pack-1"': '"automation-science-pack"',
    '"science-pack-2"': '"logistic-science-pack"',
    '"science-pack-3"': '"chemical-science-pack"',
    '"high-tech-science-pack"': '"utility-science-pack"',
    ',"recipe":"wood"': '',
    ',"recipe":"steel-axe"': '',
    ',"recipe":"iron-axe"': '',

    // if (blueprintVersion < getFactorioVersion(0, 17, 10))
    '"grass-1"': '"landfill"',
}
const nameMigrationsRegex = new RegExp(Object.keys(nameMigrations).join('|'), 'g')

function decode(str: string): Promise<Blueprint | Book> {
    return new Promise((resolve, reject) => {
        try {
            const decodedStr = atob(str.slice(1))
            const data = pako
                .inflate(decodedStr, { to: 'string' })
                .replace(nameMigrationsRegex, match => nameMigrations[match])
                .replace(/("[^,]{3,}?")/g, (_, capture: string) => capture.replace(/-/g, '_'))
            const parsedData = JSON.parse(data)
            resolve(parsedData)
        } catch (e) {
            reject(new CorruptedBlueprintStringError(e))
        }
    }).then((data: { blueprint?: BPS.IBlueprint; blueprint_book?: BPS.IBlueprintBook }) => {
        console.log(data)
        if (validate(data)) {
            if (data.blueprint_book === undefined) {
                return new Blueprint(data.blueprint)
            } else {
                const hasBlueprint = (entries: BPS.IBlueprintBookEntry[] = []): boolean => {
                    for (const entry of entries) {
                        if (entry.blueprint) return true
                        if (entry.blueprint_book && hasBlueprint(entry.blueprint_book.blueprints))
                            return true
                    }
                    return false
                }
                if (hasBlueprint(data.blueprint_book.blueprints)) {
                    return new Book(data.blueprint_book)
                } else {
                    throw new BookWithNoBlueprintsError()
                }
            }
        } else {
            const errors = validate.errors
            const trainEntityNames = new Set(['locomotive', 'cargo_wagon', 'fluid_wagon'])
            const hasTrain = (): boolean => errors.some(e => trainEntityNames.has(e.data))
            const isModded = (): boolean => errors.some(e => !!keywords[e.keyword])
            throw hasTrain()
                ? new TrainBlueprintError(errors)
                : isModded()
                ? new ModdedBlueprintError(errors)
                : errors
        }
    })
}

function encode(bpOrBook: Blueprint | Book): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            const keyName = bpOrBook instanceof Blueprint ? 'blueprint' : 'blueprint_book'
            const data = { [keyName]: bpOrBook.serialize() }
            const string = JSON.stringify(data).replace(
                /(:".+?"|"[a-z]+?_module(|_[0-9])")/g,
                (_: string, capture: string) => capture.replace(/_/g, '-')
            )
            resolve(`0${btoa(pako.deflate(string, { to: 'string' }))}`)
        } catch (e) {
            reject(e)
        }
    })
}

function getBlueprintOrBookFromSource(source: string): Promise<Blueprint | Book> {
    if (source === undefined) return Promise.resolve(new Blueprint())

    // trim whitespace
    const DATA = source.replace(/\s/g, '')

    let bpString
    if (DATA[0] === '0') {
        bpString = Promise.resolve(DATA)
    } else {
        bpString = new Promise((resolve, reject) => {
            const url = `https://${DATA.replace(/https?:\/\//g, '')}`
            try {
                resolve(new URL(url))
            } catch (e) {
                reject(e)
            }
        }).then((url: URL) => {
            console.log(`Loading data from: ${url}`)
            const pathParts = url.pathname.slice(1).split('/')

            const fetchData = (url: string): Promise<Response> =>
                fetch(`__CORS_PROXY_URL__${encodeURIComponent(url)}`).then(response => {
                    if (response.ok) return response
                    throw new Error('Network response was not ok.')
                })

            // TODO: add dropbox support https://www.dropbox.com/s/ID?raw=1
            switch (url.hostname.replace(/^www\./, '').split('.')[0]) {
                case 'pastebin':
                    return fetchData(`https://pastebin.com/raw/${pathParts[0]}`).then(r => r.text())
                case 'hastebin':
                    return fetchData(`https://hastebin.com/raw/${pathParts[0]}`).then(r => r.text())
                case 'gist':
                    return fetchData(`https://api.github.com/gists/${pathParts[1]}`)
                        .then(r => r.json())
                        .then(data => data.files[Object.keys(data.files)[0]].content)
                case 'gitlab':
                    return fetchData(`https://gitlab.com/${pathParts.join('/')}/raw`).then(r =>
                        r.text()
                    )
                case 'factorioprints':
                    return fetchData(
                        `https://facorio-blueprints.firebaseio.com/blueprints/${pathParts[1]}.json`
                    )
                        .then(r => r.json())
                        .then(data => data.blueprintString)
                case 'factorio': // factorio.school
                    if (pathParts[0] === 'api') {
                        return fetchData(url.href).then(r => r.text())
                    }

                    return fetchData(`https://www.factorio.school/api/blueprint/${pathParts[1]}`)
                        .then(r => r.json())
                        .then(data => data.blueprintString.blueprintString)
                case 'docs':
                    return fetchData(
                        `https://docs.google.com/document/d/${pathParts[2]}/export?format=txt`
                    ).then(r => r.text())
                default:
                    return fetchData(url.href).then(r => r.text())
            }
        })
    }

    return bpString.then(decode)
}

export {
    ModdedBlueprintError,
    TrainBlueprintError,
    CorruptedBlueprintStringError,
    BookWithNoBlueprintsError,
    encode,
    getBlueprintOrBookFromSource,
}
