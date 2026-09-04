import Welcome from '../easyssh/welcome'

export default function NoSessionPanel ({ height, onNewTab, onNewSsh, batch }) {
  const props = {
    style: {
      height: height + 'px'
    }
  }
  const handleClick = () => {
    window.openTabBatch = batch
  }
  return (
    <div className='no-sessions electerm-logo-bg' {...props}>
      <div className='no-session-dashboard' onClick={handleClick}>
        <Welcome
          height={height}
          store={window.store}
          onNewSsh={onNewSsh}
        />
      </div>
    </div>
  )
}
