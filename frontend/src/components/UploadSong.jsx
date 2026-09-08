import { useRef, useState } from 'react'
import { uploadSong } from '../api.js'

const MAX_FILE_SIZE_MB = Number(import.meta.env.VITE_MAX_FILE_SIZE_MB || 20)
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024

function titleFromFileName(fileName) {
    return fileName.trim().replace(/\.mp3$/i, '').trim()
}

export default function UploadSong({ onSongUploaded }) {
    const formRef = useRef(null)
    const fileInputRef = useRef(null)
    const [selectedFile, setSelectedFile] = useState(null)
    const [artist, setArtist] = useState('')
    const [album, setAlbum] = useState('')
    const [uploading, setUploading] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')

    function handleFileChange(event) {
        const file = event.target.files?.[0]
        setMessage('')
        setError('')

        if (!file) {
            setSelectedFile(null)
            return
        }

        const isMp3 = file.name.toLowerCase().endsWith('.mp3')
        const hasAudioMimeType = !file.type || ['audio/mpeg', 'audio/mp3'].includes(file.type)

        if (!isMp3 || !hasAudioMimeType) {
            setSelectedFile(null)
            setError('Please choose an MP3 file.')
            event.target.value = ''
            return
        }

        if (file.size > MAX_FILE_SIZE) {
            setSelectedFile(null)
            setError(`The MP3 file must be ${MAX_FILE_SIZE_MB} MB or smaller.`)
            event.target.value = ''
            return
        }

        setSelectedFile(file)
    }

    async function handleSubmit(event) {
        event.preventDefault()
        setMessage('')
        setError('')

        if (!selectedFile) {
            setError('Please choose an MP3 file first.')
            return
        }

        setUploading(true)

        try {
            const song = await uploadSong({ file: selectedFile, artist, album })
            onSongUploaded(song)
            setMessage('Song added to your library.')
            setSelectedFile(null)
            setArtist('')
            setAlbum('')

            if (formRef.current) {
                formRef.current.reset()
            }

            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }
        } catch (uploadError) {
            console.error('Song upload failed:', uploadError)
            setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload song.')
        } finally {
            setUploading(false)
        }
    }

    return (
        <section className="panel upload-panel" aria-labelledby="upload-heading">
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Add to the room</p>
                    <h2 id="upload-heading">Upload a song</h2>
                </div>
                <span className="upload-icon" aria-hidden="true">＋</span>
            </div>

            <form ref={formRef} className="upload-form" onSubmit={handleSubmit}>
                <label className="file-dropzone">
                    <input ref={fileInputRef} type="file" accept="audio/mpeg,audio/mp3,.mp3" onChange={handleFileChange} />
                    <span className="file-mark" aria-hidden="true">♫</span>
                    <strong>{selectedFile ? selectedFile.name : 'Choose an MP3 file'}</strong>
                    <span>Up to {MAX_FILE_SIZE_MB} MB</span>
                </label>

                {selectedFile && <p className="derived-title">Title: {titleFromFileName(selectedFile.name)}</p>}

                <label className="form-field">
                    <span>Artist <em>optional</em></span>
                    <input value={artist} onChange={(event) => setArtist(event.target.value)} placeholder="Unknown Artist" />
                </label>

                <label className="form-field">
                    <span>Album <em>optional</em></span>
                    <input value={album} onChange={(event) => setAlbum(event.target.value)} placeholder="Single" />
                </label>

                <button className="primary-button" type="submit" disabled={uploading}>
                    {uploading ? 'Uploading...' : 'Upload to library'}
                </button>

                {message && <p className="success-message">{message}</p>}
                {error && <p className="error-message">{error}</p>}
            </form>
        </section>
    )
}
