import React, { useState } from 'react'
import './App.css'

// Get API URL from environment variables
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function App() {
  const [currentStep, setCurrentStep] = useState('upload') // upload, searching, results
  const [uploadedImage, setUploadedImage] = useState(null)
  const [searchResults, setSearchResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedImage, setSelectedImage] = useState(null)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [downloadProgress, setDownloadProgress] = useState(null)
  const [selectedImages, setSelectedImages] = useState(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [loadedImages, setLoadedImages] = useState(new Set())
  const [isModalLoading, setIsModalLoading] = useState(false)
  
  // Virtual Scrolling states
  const [visibleCount, setVisibleCount] = useState(20) // Show 20 images initially
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  
  // Smart Preloading states
  const [preloadedImages, setPreloadedImages] = useState(new Set())
  const [isPreloading, setIsPreloading] = useState(false)
  
  // Memory Cleanup states
  const [imageCache, setImageCache] = useState(new Map())
  
  // Favorites system
  const [favoriteImages, setFavoriteImages] = useState(new Set())

  const handleImageUpload = (event) => {
    const file = event.target.files[0]
    if (file) {
      setUploadedImage(file)
    }
  }

  const handleCameraCapture = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment' // Use back camera on mobile
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (file) {
        setUploadedImage(file)
      }
    }
    input.click()
  }

  const handleImageReplace = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (file) {
        setUploadedImage(file)
      }
    }
    input.click()
  }

  const handleSearch = async () => {
    if (!uploadedImage) return

    setIsLoading(true)
    setCurrentStep('searching')
    setError(null)

    const formData = new FormData()
    formData.append('image', uploadedImage)
    formData.append('threshold', '0.6')

    try {
      const response = await fetch(`${API_URL}/search`, {
        method: 'POST',
        body: formData
      })

      const data = await response.json()
      
      if (data.success) {
        setSearchResults(data.matches)
        setCurrentStep('results')
        
        // Start preloading first 10 images immediately
        setTimeout(() => {
          preloadNextImages(0, 10)
        }, 500)
      } else {
        // Convert technical error to user-friendly message
        let userFriendlyError = 'שגיאה בחיפוש התמונות'
        
        if (data.error && data.error.includes('Face could not be detected')) {
          userFriendlyError = 'לא הצלחנו לזהות פנים בתמונה'
        } else if (data.error && data.error.includes('No face detected')) {
          userFriendlyError = 'לא נמצאו פנים בתמונה'
        } else if (data.error && data.error.includes('Too many matches')) {
          userFriendlyError = 'נמצאו יותר מדי התאמות - נסה תמונה ברורה יותר או זווית אחרת'
        } else if (data.error && data.error.includes('Very few matches')) {
          userFriendlyError = 'נמצאו מעט מדי התאמות - נסה תמונה ברורה יותר או זווית אחרת'
        } else if (data.error) {
          userFriendlyError = 'שגיאה בעיבוד התמונה'
        }
        
        setError(userFriendlyError)
        setCurrentStep('upload')
      }
    } catch (error) {
      setError('שגיאה בחיבור לשרת: ' + error.message)
      setCurrentStep('upload')
    } finally {
      setIsLoading(false)
    }
  }

  const resetSearch = () => {
    setCurrentStep('upload')
    setUploadedImage(null)
    setSearchResults([])
    setError(null)
    setSelectedImage(null)
    setSelectedImages(new Set())
    setIsSelectionMode(false)
    setVisibleCount(20) // Reset to initial count
    setPreloadedImages(new Set()) // Reset preloaded images
    setImageCache(new Map()) // Reset image cache
    setFavoriteImages(new Set()) // Reset favorites
  }

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode)
    if (isSelectionMode) {
      setSelectedImages(new Set())
    }
  }

  const toggleImageSelection = (index) => {
    const newSelected = new Set(selectedImages)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedImages(newSelected)
  }

  const downloadSelectedImages = async () => {
    if (selectedImages.size === 0) return
    
    setIsLoading(true)
    setDownloadProgress({ current: 0, total: selectedImages.size })
    
    try {
      // Prepare image paths for ZIP download
      const imagePaths = Array.from(selectedImages).map(index => {
        const result = searchResults[index]
        const relativePath = result.image_path.split('photos\\')[1] || result.image_path.split('photos/')[1]
        return relativePath
      })
      
      // Update progress
      setDownloadProgress({ current: selectedImages.size, total: selectedImages.size })
      
      // Download as ZIP
      const response = await fetch('${API_URL}/download-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_paths: imagePaths
        })
      })
      
      if (response.ok) {
        // Create download link for ZIP
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `תמונות_נבחרות_${selectedImages.size}_תמונות.zip`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
      } else {
        throw new Error('Failed to download ZIP')
      }
    } catch (error) {
      console.error('Error downloading images:', error)
      setError('שגיאה בהורדת התמונות')
    } finally {
      setIsLoading(false)
      setDownloadProgress(null)
    }
  }


  const openImageModal = async (imageUrl, index) => {
    setSelectedImageIndex(index)
    setIsModalLoading(true)
    
    // Load the image for modal
    try {
      // Check if image is already in cache
      if (imageCache.has(imageUrl)) {
        setSelectedImage(imageUrl);
        setIsModalLoading(false);
        preloadAdjacentModalImages(index);
        return;
      }

      const img = new Image();
      img.onload = () => {
        setSelectedImage(imageUrl);
        setIsModalLoading(false);
        imageCache.set(imageUrl, true); // Mark as loaded in cache
        preloadAdjacentModalImages(index);
      };
      img.onerror = () => {
        setSelectedImage(imageUrl); // Fallback to original URL
        setIsModalLoading(false);
        imageCache.set(imageUrl, false); // Mark as failed in cache
      };
      img.src = imageUrl;
    } catch (error) {
      setSelectedImage(imageUrl) // Fallback to original URL
      setIsModalLoading(false)
    }
  }

  const closeImageModal = () => {
    // Scroll to the current image in the grid before closing
    const currentImageElement = document.querySelector(`.photo-item:nth-child(${selectedImageIndex + 1})`)
    if (currentImageElement) {
      currentImageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    
    setSelectedImage(null)
  }

  const navigateImage = async (direction) => {
    const newIndex = selectedImageIndex + direction
    if (newIndex >= 0 && newIndex < searchResults.length) {
      const filename = searchResults[newIndex].image_path.split('\\').pop()
      const relativePath = searchResults[newIndex].image_path.split('photos\\')[1] || searchResults[newIndex].image_path.split('photos/')[1]
      const imageUrl = `${API_URL}/images/${relativePath}`
      
      setIsModalLoading(true)
      
      // Load the new image
      try {
        // Check if image is already in cache
        if (imageCache.has(imageUrl)) {
          setSelectedImage(imageUrl);
          setSelectedImageIndex(newIndex);
          setIsModalLoading(false);
          preloadAdjacentModalImages(newIndex);
          return;
        }

        const img = new Image();
        img.onload = () => {
          setSelectedImage(imageUrl);
          setSelectedImageIndex(newIndex);
          setIsModalLoading(false);
          imageCache.set(imageUrl, true); // Mark as loaded in cache
          preloadAdjacentModalImages(newIndex);
        };
        img.onerror = () => {
          setSelectedImage(imageUrl); // Fallback
          setSelectedImageIndex(newIndex);
          setIsModalLoading(false);
          imageCache.set(imageUrl, false); // Mark as failed in cache
        };
        img.src = imageUrl;
      } catch (error) {
        setSelectedImage(imageUrl) // Fallback
        setSelectedImageIndex(newIndex)
        setIsModalLoading(false)
      }
    }
  }

  const downloadImage = async (imageUrl, filename) => {
    try {
      // Convert image URL to download URL
      const downloadUrl = imageUrl.replace('/images/', '/download/')
      
      // Fetch the image
      const response = await fetch(downloadUrl)
      const blob = await response.blob()
      
      // Create a download link with blob URL
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename || 'wedding-photo.jpg'
      // Don't use target='_blank' - it opens a new tab
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Clean up blob URL
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100)
    } catch (error) {
      console.error('Error downloading image:', error)
      // Fallback to simple download
      const downloadUrl = imageUrl.replace('/images/', '/download/')
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename || 'wedding-photo.jpg'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  // Toggle favorite status for an image
  const toggleFavorite = (imageUrl) => {
    setFavoriteImages(prev => {
      const newFavorites = new Set(prev)
      if (newFavorites.has(imageUrl)) {
        newFavorites.delete(imageUrl)
      } else {
        newFavorites.add(imageUrl)
      }
      return newFavorites
    })
  }

  // Check if image is favorite
  const isFavorite = (imageUrl) => {
    return favoriteImages.has(imageUrl)
  }

  const downloadAllImages = async () => {
    if (searchResults.length === 0) return
    
    setIsLoading(true)
    setDownloadProgress({ current: 0, total: searchResults.length })
    
    try {
      // Prepare image paths for ZIP download
      const imagePaths = searchResults.map(result => {
        const relativePath = result.image_path.split('photos\\')[1] || result.image_path.split('photos/')[1]
        return relativePath
      })
      
      // Update progress
      setDownloadProgress({ current: searchResults.length, total: searchResults.length })
      
      // Download as ZIP
      const response = await fetch('${API_URL}/download-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_paths: imagePaths
        })
      })
      
      if (response.ok) {
        // Create download link for ZIP
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `תמונות_חתונה_${searchResults.length}_תמונות.zip`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
      } else {
        throw new Error('Failed to download ZIP')
      }
    } catch (error) {
      console.error('Error downloading images:', error)
      setError('שגיאה בהורדת התמונות')
    } finally {
      setIsLoading(false)
      setDownloadProgress(null)
    }
  }

  // Load more images function
  const loadMoreImages = () => {
    if (isLoadingMore || visibleCount >= searchResults.length) return
    
    setIsLoadingMore(true)
    
    // Simulate loading delay for smooth UX
    setTimeout(() => {
      setVisibleCount(prev => Math.min(prev + 20, searchResults.length))
      setIsLoadingMore(false)
    }, 300)
  }

  // Smart preloading function
  const preloadNextImages = async (startIndex, count = 10) => {
    if (isPreloading || startIndex >= searchResults.length) return
    
    setIsPreloading(true)
    
    try {
      const imagesToPreload = searchResults
        .slice(startIndex, startIndex + count)
        .map(result => {
          const relativePath = result.image_path.split('photos\\')[1] || result.image_path.split('photos/')[1]
          return `${API_URL}/images/${relativePath}`
        })
      
      // Preload images in background
      const preloadPromises = imagesToPreload.map(url => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            setPreloadedImages(prev => new Set([...prev, url]));
            imageCache.set(url, true); // Mark as loaded in cache
            resolve();
          };
          img.onerror = () => {
            imageCache.set(url, false); // Mark as failed in cache
            resolve(); // Continue even if image fails
          };
          img.src = url;
        })
      })
      
      await Promise.all(preloadPromises)
    } catch (error) {
      console.log('Preloading error:', error)
    } finally {
      setIsPreloading(false)
    }
  }

  // Preload adjacent images for modal navigation
  const preloadAdjacentModalImages = (currentIndex) => {
    const imagesToPreload = []
    
    // Preload next 2 images
    for (let i = 1; i <= 2; i++) {
      const nextIndex = currentIndex + i
      if (nextIndex < searchResults.length) {
        const result = searchResults[nextIndex]
        const relativePath = result.image_path.split('photos\\')[1] || result.image_path.split('photos/')[1]
        imagesToPreload.push(`${API_URL}/images/${relativePath}`)
      }
    }
    
    // Preload previous 2 images
    for (let i = 1; i <= 2; i++) {
      const prevIndex = currentIndex - i
      if (prevIndex >= 0) {
        const result = searchResults[prevIndex]
        const relativePath = result.image_path.split('photos\\')[1] || result.image_path.split('photos/')[1]
        imagesToPreload.push(`${API_URL}/images/${relativePath}`)
      }
    }
    
    // Preload all adjacent images in background
    imagesToPreload.forEach(url => {
      if (!preloadedImages.has(url)) {
        const img = new Image()
        img.onload = () => {
          setPreloadedImages(prev => new Set([...prev, url]))
        }
        img.onerror = () => {} // Silent fail
        img.src = url
      }
    })
  }

  // Check if user scrolled to bottom
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100
    
    if (isNearBottom && visibleCount < searchResults.length) {
      loadMoreImages()
    }
    
    // Smart preloading - preload next 10 images when user is 80% down
    const scrollPercent = (scrollTop + clientHeight) / scrollHeight
    if (scrollPercent > 0.8 && visibleCount < searchResults.length) {
      preloadNextImages(visibleCount, 10)
    }
  }

  // Memory cleanup function
  const cleanupOldImages = () => {
    // Keep only the last 50 preloaded images to prevent memory overflow
    if (preloadedImages.size > 50) {
      const imagesArray = Array.from(preloadedImages)
      const keepImages = imagesArray.slice(-50)
      setPreloadedImages(new Set(keepImages))
    }
    
    // Clean up image cache if it gets too large
    if (imageCache.size > 100) {
      const cacheArray = Array.from(imageCache.entries())
      const keepCache = cacheArray.slice(-100)
      setImageCache(new Map(keepCache))
    }
  }

  // Run cleanup every 30 seconds
  React.useEffect(() => {
    const cleanupInterval = setInterval(cleanupOldImages, 30000)
    return () => clearInterval(cleanupInterval)
  }, [preloadedImages, imageCache])

  return (
    <div className="app" dir="rtl">
      <header className="header">
        <h1>🎉החתונה של עמית וגיא</h1>
        <p>מצא את עצמך בתמונות החתונה</p>
      </header>

      <main className="main">
        {currentStep === 'upload' && (
          <div className="upload-section">
            <h2>העלה את התמונה שלך</h2>
            <div className="upload-area">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                id="image-upload"
                className="file-input"
              />
              <label htmlFor="image-upload" className="upload-label">
                {uploadedImage ? (
                  <div className="preview">
                    <img src={URL.createObjectURL(uploadedImage)} alt="Preview" />
                    <p>לחץ לשינוי התמונה</p>
                  </div>
                ) : (
                  <div className="upload-placeholder">
                    <div className="upload-icon">📸</div>
                    <p>לחץ להעלאת התמונה שלך</p>
                    <small>JPG, PNG נתמכים</small>
                  </div>
                )}
              </label>
            </div>
            
            {uploadedImage && (
              <div className="upload-options">
                <button 
                  onClick={handleImageReplace}
                  className="replace-btn"
                  disabled={isLoading}
                >
                  🔄 החלף תמונה
                </button>
              </div>
            )}
            
            {uploadedImage && (
              <button onClick={handleSearch} className="search-btn">
                🔍 מצא את התמונות שלי
              </button>
            )}
            
            {error && (
              <div className="error-message">
                <div className="error-icon">😔</div>
                <div className="error-content">
                  <p className="error-main">{error}</p>
                  <p className="error-suggestion">נסה עם תמונה אחרת או וודא שהפנים נראים בבירור</p>
                </div>
              </div>
            )}
          </div>
        )}

        {currentStep === 'searching' && (
          <div className="searching-section">
            <div className="loading">
              <div className="spinner"></div>
              <h2>מחפש את התמונות שלך...</h2>
              <p>זה יכול לקחת כמה רגעים</p>
            </div>
          </div>
        )}

        {currentStep === 'results' && (
          <div className="results-section">
                        <div className="results-header">
                            <div className="results-info">
                                <h2>נמצאו {searchResults.length} תמונות!</h2>
                            </div>
                            <div className="header-buttons">
                                <button onClick={resetSearch} className="new-search-btn">
                                    🔄 חיפוש חדש
                                </button>
                            </div>
                        </div>
            
            <div className="photo-grid" onScroll={handleScroll}>
              {searchResults
                .sort((a, b) => {
                  // Extract number from filename like "alon akonina (1234).jpg"
                  const getNumber = (filename) => {
                    const match = filename.match(/\((\d+)\)/);
                    return match ? parseInt(match[1]) : 0;
                  };
                  
                  const numA = getNumber(a.image_path.split('\\').pop());
                  const numB = getNumber(b.image_path.split('\\').pop());
                  
                  return numA - numB; // Sort ascending by number
                })
                .slice(0, visibleCount) // Only show visible images
                .map((result, index) => {
                  const filename = result.image_path.split('\\').pop();
                  const number = filename.match(/\((\d+)\)/)?.[1] || '?';
                  
                  // Extract relative path from full path
                  const relativePath = result.image_path.split('photos\\')[1] || result.image_path.split('photos/')[1];
                  const imageUrl = `${API_URL}/images/${relativePath}`;
                  
                  return (
                    <div key={index} className="photo-item">
                      <div className="photo-container">
                        <img 
                          src={imageUrl}
                          alt={`תמונה ${number}`}
                          loading="lazy"
                          onClick={() => openImageModal(imageUrl, index)}
                          onLoad={(e) => {
                            // Mark image as loaded for smooth transitions
                            e.target.style.opacity = '1'
                          }}
                          onError={(e) => {
                            e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBmb3VuZDwvdGV4dD48L3N2Zz4='
                          }}
                          style={{
                            opacity: preloadedImages.has(imageUrl) ? 1 : 0.7,
                            transition: 'opacity 0.3s ease'
                          }}
                        />
                        <button 
                          className="download-single-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            downloadImage(imageUrl, filename)
                          }}
                          title="הורד תמונה"
                        >
                          ⬇️
                        </button>
                        <button 
                          className={`favorite-btn ${isFavorite(imageUrl) ? 'favorited' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFavorite(imageUrl)
                          }}
                          title={isFavorite(imageUrl) ? 'הסר ממועדפים' : 'הוסף למועדפים'}
                        >
                          {isFavorite(imageUrl) ? '❤️' : '🤍'}
                        </button>
                      </div>
                      <div className="photo-info">
                        <p className="photo-number">תמונה #{number}</p>
                        <p className="photo-counter">{index + 1} מתוך {searchResults.length}</p>
                        <p className="similarity">{(result.similarity * 100).toFixed(1)}% התאמה</p>
                        <p className="click-hint">לחץ להגדלה</p>
                      </div>
                    </div>
                  );
                })}
              
              {/* Load More Button */}
              {visibleCount < searchResults.length && (
                <div className="load-more-section">
                  {isLoadingMore ? (
                    <div className="loading-more">
                      <div className="spinner"></div>
                      <p>טוען עוד תמונות...</p>
                    </div>
                  ) : (
                    <button 
                      className="load-more-btn"
                      onClick={loadMoreImages}
                    >
                      📸 טען עוד תמונות ({searchResults.length - visibleCount} נותרו)
                    </button>
                  )}
                </div>
              )}
              
              {/* Progress indicator */}
              <div className="progress-indicator">
                <p>מציג {visibleCount} מתוך {searchResults.length} תמונות</p>
              </div>
      </div>
            
          </div>
        )}
      </main>

      {/* Image Modal */}
      {selectedImage && (
        <div className="image-modal" onClick={closeImageModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>תמונה #{searchResults[selectedImageIndex]?.image_path.split('\\').pop().match(/\((\d+)\)/)?.[1] || '?'}</h3>
              <button className="close-btn" onClick={closeImageModal}>❌</button>
            </div>
            
            <div className="modal-image-container">
              <button 
                className="nav-btn prev-btn" 
                onClick={() => navigateImage(-1)}
                disabled={selectedImageIndex === 0 || isModalLoading}
              >
                ⬅️
              </button>
              
              {isModalLoading ? (
                <div className="modal-loading">
                  <div className="spinner"></div>
                  <p>טוען תמונה...</p>
                </div>
              ) : (
                <img 
                  src={selectedImage} 
                  alt="Full size" 
                  className="modal-image"
                />
              )}
              
              <button 
                className="nav-btn next-btn" 
                onClick={() => navigateImage(1)}
                disabled={selectedImageIndex === searchResults.length - 1 || isModalLoading}
              >
                ➡️
        </button>
            </div>
            
            <div className="modal-footer">
              <p className="image-counter">
                {selectedImageIndex + 1} מתוך {searchResults.length}
              </p>
              <div className="modal-actions">
                <button 
                  className={`modal-favorite-btn ${isFavorite(selectedImage) ? 'favorited' : ''}`}
                  onClick={() => toggleFavorite(selectedImage)}
                  title={isFavorite(selectedImage) ? 'הסר מאהבתי' : 'הוסף לאהבתי'}
                >
                  {isFavorite(selectedImage) ? '❤️ אהבתי' : '🤍 אהבתי'}
                </button>
                <button className="download-btn" onClick={() => {
                  const result = searchResults[selectedImageIndex]
                  const filename = result?.image_path.split('\\').pop()
                  downloadImage(selectedImage, filename)
                }}>
                  ⬇️ הורד תמונה
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
  )
}

export default App